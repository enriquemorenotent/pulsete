import { randomUUID } from 'node:crypto';
import { badRequest } from './app-error.js';
import { assistantBaseInstructions, getAssistantOutputSchema } from './assistant-prompts.js';
import {
  buildAssistantExecutionInput,
  resolveActiveBuffer,
  resolveAskContext,
  resolveBufferTaskContext,
} from './assistant-service-context.js';
import {
  assistantSandboxCwd,
  assistantThreadSandbox,
  assistantTurnSandboxPolicy,
  localAssistantTurnIdPrefix,
  toTurnError,
  type PendingExecution,
  type QueuedExecution,
  type RawThreadStartResponse,
} from './assistant-service-shared.js';
import {
  buildAssistantTranscript,
  buildPendingTurn,
  toAttachmentMetadata,
} from './assistant-service-turns.js';
import {
  discardPendingExecution,
  hasLiveExecution,
  persistTurn,
  requireThread,
  snapshotMessage,
} from './assistant-service-runtime-helpers.js';
import type {
  AssistantServiceRuntimeContext,
  AssistantThreadSummary,
  AssistantStartExecutionInput,
} from './assistant-service-runtime-types.js';

export const startExecution = async (
  context: AssistantServiceRuntimeContext,
  input: AssistantStartExecutionInput,
) => {
  const summary = requireThread(context, input.threadId);
  if (summary.turnStatus === 'inProgress' || hasLiveExecution(context, summary.id)) {
    throw badRequest('Wait for the current assistant turn to stop before starting another one');
  }
  context.state.interruptRequests.delete(summary.id);
  const localTurnId = input.clientTurnId ?? `${localAssistantTurnIdPrefix}${randomUUID()}`;
  const existingTurns = context.params.assistant.getThreadTurns(summary.id) ?? [];
  if (existingTurns.some((turn) => turn.id === localTurnId)) {
    throw badRequest('Assistant turn id is already in use');
  }
  const queuedExecution: QueuedExecution = {
    kind: 'turn',
    activeBuffer: resolveActiveBuffer(context.params.conversations, input.activeBufferId ?? null),
    attachments: (input.attachments ?? []).map(toAttachmentMetadata),
    localTurnId,
    prompt: input.prompt,
    resolvedSubject: null,
    routing: null,
    threadId: summary.id,
  };
  const queuedTurn = buildPendingTurn(queuedExecution);
  context.state.pendingStarts.set(summary.id, queuedExecution);
  context.state.liveTurns.set(queuedExecution.localTurnId, {
    threadId: summary.id,
    executionThreadId: null,
    remoteTurnId: null,
    turn: queuedTurn,
  });
  persistTurn(context, summary.id, queuedTurn);
  context.params.assistant.upsertThread({ ...summary, turnStatus: 'inProgress', updatedAt: Date.now() });
  launchExecution(context, summary.id, queuedExecution, input.attachments ?? []);
  return {
    messages: [{ type: 'assistant.turn.started' as const, threadId: summary.id, turn: queuedTurn }],
  };
};

const launchExecution = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  queuedExecution: QueuedExecution,
  attachments: AssistantStartExecutionInput['attachments'],
) => {
  void runExecution(context, threadId, queuedExecution, attachments ?? []).catch((error) => {
    failQueuedTurn(context, threadId, queuedExecution.localTurnId, error);
  });
};

const runExecution = async (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  queuedExecution: QueuedExecution,
  attachments: NonNullable<AssistantStartExecutionInput['attachments']>,
) => {
  const summary = context.params.assistant.getThread(threadId);
  if (!summary) {
    return;
  }
  const execution = await context.params.callAppServer<RawThreadStartResponse>('thread/start', buildThreadStartParams(summary.model));
  const pendingExecution: PendingExecution = { ...queuedExecution, executionThreadId: execution.thread.id };
  if (context.state.pendingStarts.get(threadId)?.localTurnId === queuedExecution.localTurnId) {
    context.state.pendingStarts.delete(threadId);
  }
  context.state.executionThreads.set(execution.thread.id, pendingExecution);
  const live = context.state.liveTurns.get(queuedExecution.localTurnId);
  if (live) {
    live.executionThreadId = execution.thread.id;
    context.state.liveTurns.set(queuedExecution.localTurnId, live);
  }
  const currentSummary = context.params.assistant.getThread(threadId);
  if (!currentSummary) {
    discardPendingExecution(context, threadId, queuedExecution.localTurnId);
    return;
  }
  const priorTurns = (context.params.assistant.getThreadTurns(threadId) ?? []).filter((turn) => turn.id !== queuedExecution.localTurnId);
  const priorTranscript = buildAssistantTranscript(priorTurns);
  const turnInput = currentSummary.task === 'ask'
    ? buildAskTurnInput(context, pendingExecution, currentSummary, priorTurns, priorTranscript, attachments)
    : buildBufferTaskTurnInput(context, queuedExecution.prompt, currentSummary, priorTranscript, attachments);
  await context.params.callAppServer('turn/start', {
    threadId: execution.thread.id,
    input: turnInput,
    cwd: assistantSandboxCwd,
    approvalPolicy: 'never',
    sandboxPolicy: assistantTurnSandboxPolicy,
    model: currentSummary.model,
    personality: 'pragmatic',
    outputSchema: getAssistantOutputSchema(currentSummary.task),
  });
};

const buildAskTurnInput = (
  context: AssistantServiceRuntimeContext,
  pendingExecution: PendingExecution,
  currentSummary: AssistantThreadSummary,
  priorTurns: NonNullable<ReturnType<AssistantServiceRuntimeContext['params']['assistant']['getThreadTurns']>>,
  priorTranscript: string,
  attachments: NonNullable<AssistantStartExecutionInput['attachments']>,
) => {
  const askContext = resolveAskContext({
    activeBuffer: pendingExecution.activeBuffer,
    priorTurns: priorTurns ?? [],
    prompt: pendingExecution.prompt,
    conversations: context.params.conversations,
  });
  pendingExecution.routing = askContext.routing;
  pendingExecution.resolvedSubject = askContext.resolvedSubject;
  const liveTurn = context.state.liveTurns.get(pendingExecution.localTurnId);
  if (liveTurn) {
    liveTurn.turn = {
      ...liveTurn.turn,
      resolvedSubject: askContext.resolvedSubject,
      routing: askContext.routing,
    };
    context.state.liveTurns.set(pendingExecution.localTurnId, liveTurn);
    persistTurn(context, pendingExecution.threadId, liveTurn.turn);
  }
  return buildAssistantExecutionInput({
    activeBuffer: askContext.activeBuffer,
    askInstruction: askContext.askInstruction,
    attachments,
    priorRetrievedContext: askContext.priorRetrievedContext,
    priorTranscript,
    prompt: pendingExecution.prompt,
    resolvedSubject: askContext.resolvedSubject,
    retrievedContext: askContext.retrievedContext,
    scope: currentSummary.scope,
    task: currentSummary.task,
  });
};

const buildBufferTaskTurnInput = (
  context: AssistantServiceRuntimeContext,
  prompt: string,
  currentSummary: AssistantThreadSummary,
  priorTranscript: string,
  attachments: NonNullable<AssistantStartExecutionInput['attachments']>,
) => {
  const taskContext = resolveBufferTaskContext({
    bufferId: currentSummary.bufferId,
    networkId: currentSummary.networkId,
    scope: currentSummary.scope,
    target: currentSummary.target,
    prompt,
    task: currentSummary.task,
    conversations: context.params.conversations,
    networks: context.params.networks,
  });
  return buildAssistantExecutionInput({
    attachments: [...attachments, ...taskContext.attachments],
    buffer: taskContext.buffer,
    context: taskContext.context,
    network: taskContext.network,
    priorTranscript,
    prompt,
    scope: currentSummary.scope,
    task: currentSummary.task,
  });
};

const failQueuedTurn = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  localTurnId: string,
  error: unknown,
) => {
  const live = context.state.liveTurns.get(localTurnId);
  discardPendingExecution(context, threadId, localTurnId);
  if (!live) {
    return;
  }
  context.state.liveTurns.delete(localTurnId);
  context.state.interruptRequests.delete(threadId);
  const failedTurn = {
    ...live.turn,
    status: 'failed' as const,
    error: toTurnError(error) ?? (error instanceof Error ? error.message : String(error)),
  };
  persistTurn(context, threadId, failedTurn);
  const summary = context.params.assistant.getThread(threadId);
  if (!summary) {
    return;
  }
  context.params.assistant.upsertThread({ ...summary, turnStatus: failedTurn.status, updatedAt: Date.now() });
  context.params.publish([{ type: 'assistant.turn.completed', threadId, turn: failedTurn }, snapshotMessage(context)]);
};

const buildThreadStartParams = (model: string) => ({
  model,
  modelProvider: 'openai',
  cwd: assistantSandboxCwd,
  approvalPolicy: 'never',
  sandbox: assistantThreadSandbox,
  personality: 'pragmatic',
  serviceName: 'pulsete_assistant',
  baseInstructions: assistantBaseInstructions,
});
