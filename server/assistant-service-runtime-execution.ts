import { randomUUID } from 'node:crypto';
import { getNetworkRootId } from '../shared/network-model.js';
import type { ServerMessage } from '../shared/protocol.js';
import { badRequest } from './app-error.js';
import {
  assistantActionResolverOutputSchema,
  buildAssistantActionResolverInput,
  shouldResolveAssistantAction,
  type AssistantActionContext,
} from './assistant-actions.js';
import {
  applyPersonaNoteCommand,
  assistantPersonaRewriteOutputSchema,
  buildPersonaNoteClarification,
  buildPersonaNoteMissingNetworkReply,
  buildPersonaNoteNoChangeReply,
  buildPersonaNoteRewriteInput,
  buildPersonaNoteUpdatedReply,
  parseExplicitPersonaNoteCommand,
} from './assistant-persona-note.js';
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
    attachmentInputs: input.attachments ?? [],
    assistantAction: null,
    localTurnId,
    prompt: input.prompt,
    resolvedSubject: null,
    routing: null,
    threadId: summary.id,
  };
  if (summary.task === 'ask') {
    const explicitPersonaResult = maybeHandleExplicitPersonaNoteTurn(context, summary, queuedExecution);
    if (explicitPersonaResult) {
      return explicitPersonaResult;
    }
    if (shouldResolveAssistantAction({ prompt: queuedExecution.prompt, priorTurns: existingTurns })) {
      queuedExecution.assistantAction = {
        phase: 'resolve',
        context: resolveAssistantActionContext(context, queuedExecution),
      };
    }
  }
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
  launchExecution(context, summary.id, queuedExecution);
  return {
    messages: [{ type: 'assistant.turn.started' as const, threadId: summary.id, turn: queuedTurn }],
  };
};

export const completeLocalTurn = (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
  queuedExecution: QueuedExecution,
  reply: string,
  mutationMessages: readonly ServerMessage[] = [],
) => {
  const pendingTurn = buildPendingTurn(queuedExecution);
  const completedTurn = {
    ...pendingTurn,
    status: 'completed' as const,
    items: [
      ...pendingTurn.items,
      {
        type: 'agentMessage' as const,
        id: `${queuedExecution.localTurnId}:assistant`,
        text: reply,
        phase: null,
        artifact: null,
      },
    ],
  };
  persistTurn(context, summary.id, completedTurn);
  context.params.assistant.upsertThread({
    ...summary,
    turnStatus: completedTurn.status,
    updatedAt: Date.now(),
  });
  return {
    messages: [
      ...mutationMessages,
      { type: 'assistant.turn.completed' as const, threadId: summary.id, turn: completedTurn },
      snapshotMessage(context),
    ],
  };
};

export const startPendingExecutionTurn = async (
  context: AssistantServiceRuntimeContext,
  executionThreadId: string,
) => {
  const pendingExecution = context.state.executionThreads.get(executionThreadId);
  if (!pendingExecution) {
    return;
  }
  const currentSummary = context.params.assistant.getThread(pendingExecution.threadId);
  if (!currentSummary) {
    discardPendingExecution(context, pendingExecution.threadId, pendingExecution.localTurnId);
    return;
  }
  const live = context.state.liveTurns.get(pendingExecution.localTurnId);
  if (live) {
    live.remoteTurnId = null;
    context.state.liveTurns.set(pendingExecution.localTurnId, live);
  }
  const priorTurns = (context.params.assistant.getThreadTurns(pendingExecution.threadId) ?? [])
    .filter((turn) => turn.id !== pendingExecution.localTurnId);
  const priorTranscript = buildAssistantTranscript(priorTurns);
  const turnStart = buildPendingExecutionTurnStart(
    context,
    pendingExecution,
    currentSummary,
    priorTurns,
    priorTranscript,
  );
  await context.params.callAppServer('turn/start', {
    threadId: executionThreadId,
    input: turnStart.input,
    cwd: assistantSandboxCwd,
    approvalPolicy: 'never',
    sandboxPolicy: assistantTurnSandboxPolicy,
    model: currentSummary.model,
    personality: 'pragmatic',
    outputSchema: turnStart.outputSchema,
  });
};

const maybeHandleExplicitPersonaNoteTurn = (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
  queuedExecution: QueuedExecution,
) => {
  const command = parseExplicitPersonaNoteCommand(queuedExecution.prompt);
  if (!command) {
    return null;
  }
  if (command.kind === 'clarify') {
    return completeLocalTurn(context, summary, queuedExecution, buildPersonaNoteClarification());
  }
  return applyPersonaNoteSave(
    context,
    summary,
    queuedExecution,
    resolveAssistantActionContext(context, queuedExecution),
    command,
  );
};

const resolveAssistantActionContext = (
  context: AssistantServiceRuntimeContext,
  queuedExecution: Pick<QueuedExecution, 'activeBuffer'>,
): AssistantActionContext => {
  const activeNetwork = queuedExecution.activeBuffer
    ? context.params.networks.get(queuedExecution.activeBuffer.networkId)
    : null;
  const rootNetwork = activeNetwork
    ? context.params.networks.get(getNetworkRootId(activeNetwork)) ?? activeNetwork
    : null;
  return {
    networkId: rootNetwork?.id ?? null,
    networkName: rootNetwork?.name ?? null,
    personaNote: normalizePersonaNote(rootNetwork?.personaNote),
  };
};

const applyPersonaNoteSave = (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
  queuedExecution: QueuedExecution,
  actionContext: AssistantActionContext,
  command: { kind: 'clear' } | { kind: 'set'; note: string } | { kind: 'append'; note: string },
  replyKind: 'set' | 'append' | 'clear' | 'rewrite' = command.kind,
) => {
  if (!actionContext.networkId || !actionContext.networkName) {
    return completeLocalTurn(context, summary, queuedExecution, buildPersonaNoteMissingNetworkReply());
  }
  const currentNote = normalizePersonaNote(actionContext.personaNote);
  const nextNote = applyPersonaNoteCommand(currentNote, command);
  if (nextNote === currentNote) {
    return completeLocalTurn(
      context,
      summary,
      queuedExecution,
      buildPersonaNoteNoChangeReply(actionContext.networkName),
    );
  }
  const mutation = context.params.applyAssistantMutation?.({
    kind: 'persona.note.save',
    networkId: actionContext.networkId,
    note: nextNote,
  });
  if (!mutation) {
    return completeLocalTurn(
      context,
      summary,
      queuedExecution,
      'I can’t update saved persona notes right now.',
    );
  }
  return completeLocalTurn(
    context,
    summary,
    queuedExecution,
    buildPersonaNoteUpdatedReply({
      kind: replyKind,
      networkName: actionContext.networkName,
      note: nextNote,
    }),
    mutation.messages,
  );
};

const normalizePersonaNote = (note: string | null | undefined) =>
  (note ?? '').replace(/\r\n?/g, '\n').trim();

const launchExecution = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  queuedExecution: QueuedExecution,
) => {
  void runExecution(context, threadId, queuedExecution).catch((error) => {
    failQueuedTurn(context, threadId, queuedExecution.localTurnId, error);
  });
};

const runExecution = async (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  queuedExecution: QueuedExecution,
) => {
  const summary = context.params.assistant.getThread(threadId);
  if (!summary) {
    return;
  }
  const execution = await context.params.callAppServer<RawThreadStartResponse>(
    'thread/start',
    buildThreadStartParams(summary.model),
  );
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
  await startPendingExecutionTurn(context, execution.thread.id);
};

const buildPendingExecutionTurnStart = (
  context: AssistantServiceRuntimeContext,
  pendingExecution: PendingExecution,
  currentSummary: AssistantThreadSummary,
  priorTurns: NonNullable<ReturnType<AssistantServiceRuntimeContext['params']['assistant']['getThreadTurns']>>,
  priorTranscript: string,
) => {
  if (pendingExecution.assistantAction?.phase === 'resolve') {
    return {
      input: buildAssistantActionResolverTurnInput(
        pendingExecution.prompt,
        pendingExecution.assistantAction.context,
        priorTranscript,
      ),
      outputSchema: assistantActionResolverOutputSchema,
    };
  }
  if (pendingExecution.assistantAction?.phase === 'rewrite') {
    return {
      input: buildPersonaRewriteTurnInput(
        pendingExecution.assistantAction.context,
        pendingExecution.assistantAction.action.instruction,
      ),
      outputSchema: assistantPersonaRewriteOutputSchema,
    };
  }
  if (currentSummary.task === 'ask') {
    return {
      input: buildAskTurnInput(context, pendingExecution, currentSummary, priorTurns, priorTranscript),
      outputSchema: getAssistantOutputSchema(currentSummary.task),
    };
  }
  return {
    input: buildBufferTaskTurnInput(context, pendingExecution.prompt, currentSummary, priorTranscript, pendingExecution.attachmentInputs),
    outputSchema: getAssistantOutputSchema(currentSummary.task),
  };
};

const buildAssistantActionResolverTurnInput = (
  prompt: string,
  actionContext: AssistantActionContext,
  priorTranscript: string,
) => [{
  type: 'text' as const,
  text: buildAssistantActionResolverInput({
    context: actionContext,
    priorTranscript,
    prompt,
  }),
}];

const buildPersonaRewriteTurnInput = (
  actionContext: AssistantActionContext,
  instruction: string,
) => [{
  type: 'text' as const,
  text: buildPersonaNoteRewriteInput({
    currentNote: actionContext.personaNote,
    instruction,
    networkName: actionContext.networkName ?? 'Unknown network',
  }),
}];

const buildAskTurnInput = (
  context: AssistantServiceRuntimeContext,
  pendingExecution: PendingExecution,
  currentSummary: AssistantThreadSummary,
  priorTurns: NonNullable<ReturnType<AssistantServiceRuntimeContext['params']['assistant']['getThreadTurns']>>,
  priorTranscript: string,
) => {
  const askContext = resolveAskContext({
    activeBuffer: pendingExecution.activeBuffer,
    networks: context.params.networks,
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
    attachments: pendingExecution.attachmentInputs,
    network: askContext.network,
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
