import { canonicalizeAssistantText } from '../shared/assistant-document.js';
import {
  parseAssistantResolvedAction,
  type AssistantActionContext,
  type AssistantResolvedAction,
} from './assistant-actions.js';
import {
  applyPersonaNoteCommand,
  buildPersonaNoteMissingNetworkReply,
  buildPersonaNoteNoChangeReply,
  buildPersonaNoteUpdatedReply,
} from './assistant-persona-note.js';
import {
  completeLocalTurn,
  startPendingExecutionTurn,
} from './assistant-service-runtime-execution.js';
import {
  buildPendingUserItems,
  injectPendingUserMessage,
  mapItem,
  mapTurn,
  upsertTurnItem,
} from './assistant-service-turns.js';
import {
  toTurnError,
  toTurnStatus,
  type PendingExecution,
  type RawThreadItem,
  type RawTurn,
} from './assistant-service-shared.js';
import {
  findLocalTurnId,
  persistTurn,
  resolveExecutionThreadOwner,
  snapshotMessage,
} from './assistant-service-runtime-helpers.js';
import type {
  AssistantServiceRuntimeContext,
  AssistantThreadSummary,
} from './assistant-service-runtime-types.js';

export const handleTurnStarted = (
  context: AssistantServiceRuntimeContext,
  params: { threadId: string; turn: RawTurn },
) => {
  const threadId = resolveExecutionThreadOwner(context, params.threadId);
  const summary = context.params.assistant.getThread(threadId);
  if (!summary) {
    maybeInterruptUnknownTurn(context, threadId, params.threadId, params.turn.id);
    return;
  }
  const execution = context.state.executionThreads.get(params.threadId);
  const localTurnId = execution?.localTurnId ?? findLocalTurnId(context, params.threadId, params.turn.id) ?? params.turn.id;
  if (execution?.assistantAction) {
    const live = context.state.liveTurns.get(localTurnId);
    if (live) {
      live.executionThreadId = params.threadId;
      live.remoteTurnId = params.turn.id;
      context.state.liveTurns.set(localTurnId, live);
    }
    maybeInterruptKnownTurn(context, threadId, params.threadId, params.turn.id);
    return;
  }
  const mapped = mapTurn(summary.task, params.turn);
  const turn = {
    ...mapped,
    id: localTurnId,
    items: injectPendingUserMessage(mapped.items, localTurnId, execution),
    activeBuffer: execution?.activeBuffer ?? mapped.activeBuffer ?? null,
    resolvedSubject: execution?.resolvedSubject ?? mapped.resolvedSubject ?? null,
    routing: execution?.routing ?? mapped.routing ?? null,
  };
  context.state.liveTurns.set(localTurnId, {
    threadId,
    executionThreadId: params.threadId,
    remoteTurnId: params.turn.id,
    turn,
  });
  persistTurn(context, threadId, turn);
  context.params.publish({ type: 'assistant.turn.started', threadId, turn });
  maybeInterruptKnownTurn(context, threadId, params.threadId, params.turn.id);
};

export const handleTurnCompleted = async (
  context: AssistantServiceRuntimeContext,
  params: { threadId: string; turn: RawTurn },
) => {
  const threadId = resolveExecutionThreadOwner(context, params.threadId);
  const summary = context.params.assistant.getThread(threadId);
  if (!summary) {
    context.state.liveTurns.delete(params.turn.id);
    context.state.executionThreads.delete(params.threadId);
    context.state.interruptRequests.delete(threadId);
    return;
  }
  const execution = context.state.executionThreads.get(params.threadId);
  const localTurnId = execution?.localTurnId ?? findLocalTurnId(context, params.threadId, params.turn.id) ?? params.turn.id;
  const live = context.state.liveTurns.get(localTurnId);
  if (execution?.assistantAction) {
    await handleHiddenActionTurnCompleted(context, {
      execution,
      executionThreadId: params.threadId,
      localTurnId,
      rawTurn: params.turn,
      summary,
      threadId,
      live,
    });
    return;
  }
  const mapped = mapTurn(summary.task, params.turn);
  const next = live
    ? { ...live.turn, status: toTurnStatus(params.turn.status), error: toTurnError(params.turn.error) }
    : {
        ...mapped,
        id: localTurnId,
        items: injectPendingUserMessage(mapped.items, localTurnId, execution),
        activeBuffer: execution?.activeBuffer ?? mapped.activeBuffer ?? null,
        resolvedSubject: execution?.resolvedSubject ?? mapped.resolvedSubject ?? null,
        routing: execution?.routing ?? mapped.routing ?? null,
      };
  context.state.liveTurns.delete(localTurnId);
  context.state.executionThreads.delete(params.threadId);
  context.state.interruptRequests.delete(threadId);
  persistTurn(context, threadId, next);
  context.params.assistant.upsertThread({ ...summary, turnStatus: next.status, updatedAt: Date.now() });
  context.params.publish([{ type: 'assistant.turn.completed', threadId, turn: next }, snapshotMessage(context)]);
};

export const handleItemStarted = (
  context: AssistantServiceRuntimeContext,
  params: { threadId: string; turnId: string; item: RawThreadItem },
) => {
  if (params.item.type === 'userMessage') {
    return;
  }
  const execution = context.state.executionThreads.get(params.threadId);
  if (execution?.assistantAction) {
    return;
  }
  const threadId = resolveExecutionThreadOwner(context, params.threadId);
  const summary = context.params.assistant.getThread(threadId);
  if (!summary) {
    return;
  }
  const localTurnId = execution?.localTurnId ?? findLocalTurnId(context, params.threadId, params.turnId) ?? params.turnId;
  const live = context.state.liveTurns.get(localTurnId) ?? {
    threadId,
    executionThreadId: execution?.executionThreadId ?? params.threadId,
    remoteTurnId: params.turnId,
    turn: {
      id: localTurnId,
      status: 'inProgress' as const,
      error: null,
      items: buildPendingUserItems(localTurnId, execution),
      activeBuffer: execution?.activeBuffer ?? null,
      resolvedSubject: execution?.resolvedSubject ?? null,
      routing: execution?.routing ?? null,
    },
  };
  const item = mapItem(summary.task, params.item);
  live.turn.items = upsertTurnItem(live.turn.items, item);
  live.executionThreadId = execution?.executionThreadId ?? params.threadId;
  live.remoteTurnId = params.turnId;
  context.state.liveTurns.set(localTurnId, live);
  persistTurn(context, threadId, live.turn);
  context.params.publish({ type: 'assistant.item.started', threadId, turnId: localTurnId, item });
};

export const handleItemDelta = (
  context: AssistantServiceRuntimeContext,
  params: { threadId: string; turnId: string; itemId: string; delta: string },
) => {
  if (context.state.executionThreads.get(params.threadId)?.assistantAction) {
    return;
  }
  const localTurnId = findLocalTurnId(context, params.threadId, params.turnId) ?? params.turnId;
  const live = context.state.liveTurns.get(localTurnId);
  if (!live) {
    return;
  }
  const summary = context.params.assistant.getThread(live.threadId);
  live.turn.items = live.turn.items.map((item) =>
    item.id === params.itemId && item.type === 'agentMessage'
      ? { ...item, text: summary?.task === 'ask' ? canonicalizeAssistantText(item.text + params.delta) : item.text + params.delta }
      : item
  );
  persistTurn(context, live.threadId, live.turn);
  context.params.publish({
    type: 'assistant.item.delta',
    threadId: live.threadId,
    turnId: localTurnId,
    itemId: params.itemId,
    delta: params.delta,
  });
};

export const handleItemCompleted = (
  context: AssistantServiceRuntimeContext,
  params: { threadId: string; turnId: string; item: RawThreadItem },
) => {
  if (params.item.type === 'userMessage') {
    return;
  }
  if (context.state.executionThreads.get(params.threadId)?.assistantAction) {
    return;
  }
  const threadId = resolveExecutionThreadOwner(context, params.threadId);
  const summary = context.params.assistant.getThread(threadId);
  if (!summary) {
    return;
  }
  const localTurnId = findLocalTurnId(context, params.threadId, params.turnId) ?? params.turnId;
  const live = context.state.liveTurns.get(localTurnId);
  if (!live) {
    return;
  }
  const item = mapItem(summary.task, params.item);
  live.turn.items = upsertTurnItem(live.turn.items, item);
  persistTurn(context, threadId, live.turn);
  context.params.publish({ type: 'assistant.item.completed', threadId, turnId: localTurnId, item });
};

const handleHiddenActionTurnCompleted = async (
  context: AssistantServiceRuntimeContext,
  input: {
    execution: PendingExecution;
    executionThreadId: string;
    localTurnId: string;
    rawTurn: RawTurn;
    summary: AssistantThreadSummary;
    threadId: string;
    live: ReturnType<AssistantServiceRuntimeContext['state']['liveTurns']['get']>;
  },
) => {
  const phase = input.execution.assistantAction?.phase;
  if (!phase) {
    return;
  }
  if (phase === 'resolve') {
    await handleResolvePhaseCompletion(context, input);
    return;
  }
  finishLocalActionResult(
    context,
    input.summary,
    input.threadId,
    input.localTurnId,
    input.executionThreadId,
    completeRewritePhase(context, input.summary, input.execution, input.rawTurn),
  );
};

const handleResolvePhaseCompletion = async (
  context: AssistantServiceRuntimeContext,
  input: {
    execution: PendingExecution;
    executionThreadId: string;
    localTurnId: string;
    rawTurn: RawTurn;
    summary: AssistantThreadSummary;
    threadId: string;
    live: ReturnType<AssistantServiceRuntimeContext['state']['liveTurns']['get']>;
  },
) => {
  const resolvedAction = parseAssistantResolvedAction(input.rawTurn);
  if (!resolvedAction) {
    failHiddenActionTurn(
      context,
      input.summary,
      input.threadId,
      input.localTurnId,
      input.executionThreadId,
      input.execution,
      input.live,
      'Assistant returned an invalid action result',
    );
    return;
  }
  if (resolvedAction.kind === 'none') {
    input.execution.assistantAction = null;
    context.state.executionThreads.set(input.executionThreadId, input.execution);
    await startPendingExecutionTurn(context, input.executionThreadId);
    return;
  }
  if (resolvedAction.kind === 'clarify') {
    finishLocalActionResult(
      context,
      input.summary,
      input.threadId,
      input.localTurnId,
      input.executionThreadId,
      completeLocalTurn(context, input.summary, input.execution, resolvedAction.message),
    );
    return;
  }
  if (resolvedAction.kind === 'persona.rewrite') {
    const actionContext = input.execution.assistantAction?.context ?? emptyActionContext();
    if (!actionContext.networkId || !actionContext.networkName) {
      finishLocalActionResult(
        context,
        input.summary,
        input.threadId,
        input.localTurnId,
        input.executionThreadId,
        completeLocalTurn(context, input.summary, input.execution, buildPersonaNoteMissingNetworkReply()),
      );
      return;
    }
    if (!actionContext.personaNote) {
      finishLocalActionResult(
        context,
        input.summary,
        input.threadId,
        input.localTurnId,
        input.executionThreadId,
        completeLocalTurn(
          context,
          input.summary,
          input.execution,
          `No persona note is saved for ${actionContext.networkName} yet.`,
        ),
      );
      return;
    }
    input.execution.assistantAction = {
      phase: 'rewrite',
      context: actionContext,
      action: resolvedAction,
    };
    context.state.executionThreads.set(input.executionThreadId, input.execution);
    await startPendingExecutionTurn(context, input.executionThreadId);
    return;
  }
  finishLocalActionResult(
    context,
    input.summary,
    input.threadId,
    input.localTurnId,
    input.executionThreadId,
    completeResolvedPersonaSave(context, input.summary, input.execution, resolvedAction),
  );
};

const completeResolvedPersonaSave = (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
  execution: PendingExecution,
  action: Extract<AssistantResolvedAction, { kind: 'persona.set' | 'persona.append' | 'persona.clear' }>,
) => {
  const actionContext = execution.assistantAction?.context ?? emptyActionContext();
  if (!actionContext.networkId || !actionContext.networkName) {
    return completeLocalTurn(context, summary, execution, buildPersonaNoteMissingNetworkReply());
  }
  const currentNote = normalizeText(actionContext.personaNote);
  const nextNote = action.kind === 'persona.clear'
    ? ''
    : applyPersonaNoteCommand(currentNote, {
        kind: action.kind === 'persona.set' ? 'set' : 'append',
        note: action.note,
      });
  if (nextNote === currentNote) {
    return completeLocalTurn(
      context,
      summary,
      execution,
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
      execution,
      'I can’t update saved persona notes right now.',
    );
  }
  return completeLocalTurn(
    context,
    summary,
    execution,
    buildPersonaNoteUpdatedReply({
      kind: action.kind === 'persona.append' ? 'append' : action.kind === 'persona.clear' ? 'clear' : 'set',
      networkName: actionContext.networkName,
      note: nextNote,
    }),
    mutation.messages,
  );
};

const completeRewritePhase = (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
  execution: PendingExecution,
  rawTurn: RawTurn,
) => {
  const status = toTurnStatus(rawTurn.status);
  const error = toTurnError(rawTurn.error);
  if (status !== 'completed') {
    return {
      turn: buildFailedActionTurn(execution, {
        status: status === 'interrupted' ? 'interrupted' : 'failed',
        error,
      }),
      messages: [] as const,
    };
  }
  const rewrittenNote = extractPersonaRewriteNote(rawTurn);
  if (!rewrittenNote) {
    return {
      turn: buildFailedActionTurn(execution, {
        status: 'failed',
        error: 'Assistant returned an empty persona note rewrite',
      }),
      messages: [] as const,
    };
  }
  const actionContext = execution.assistantAction?.context ?? emptyActionContext();
  if (!actionContext.networkId || !actionContext.networkName) {
    return completeLocalTurn(context, summary, execution, buildPersonaNoteMissingNetworkReply());
  }
  const mutation = context.params.applyAssistantMutation?.({
    kind: 'persona.note.save',
    networkId: actionContext.networkId,
    note: rewrittenNote,
  });
  if (!mutation) {
    return completeLocalTurn(
      context,
      summary,
      execution,
      'I can’t update saved persona notes right now.',
    );
  }
  return completeLocalTurn(
    context,
    summary,
    execution,
    buildPersonaNoteUpdatedReply({
      kind: 'rewrite',
      networkName: actionContext.networkName,
      note: rewrittenNote,
    }),
    mutation.messages,
  );
};

const finishLocalActionResult = (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
  threadId: string,
  localTurnId: string,
  executionThreadId: string,
  result: ReturnType<typeof completeLocalTurn> | { messages: readonly never[]; turn: ReturnType<typeof buildFailedActionTurn> },
) => {
  context.state.liveTurns.delete(localTurnId);
  context.state.executionThreads.delete(executionThreadId);
  context.state.interruptRequests.delete(threadId);
  if ('turn' in result) {
    persistTurn(context, threadId, result.turn);
    context.params.assistant.upsertThread({ ...summary, turnStatus: result.turn.status, updatedAt: Date.now() });
    context.params.publish([{ type: 'assistant.turn.completed', threadId, turn: result.turn }, snapshotMessage(context)]);
    return;
  }
  context.params.publish(result.messages);
};

const failHiddenActionTurn = (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
  threadId: string,
  localTurnId: string,
  executionThreadId: string,
  execution: PendingExecution,
  live: ReturnType<AssistantServiceRuntimeContext['state']['liveTurns']['get']>,
  error: string,
) => {
  const turn = buildFailedActionTurn(execution, { error, live, localTurnId });
  context.state.liveTurns.delete(localTurnId);
  context.state.executionThreads.delete(executionThreadId);
  context.state.interruptRequests.delete(threadId);
  persistTurn(context, threadId, turn);
  context.params.assistant.upsertThread({ ...summary, turnStatus: turn.status, updatedAt: Date.now() });
  context.params.publish([{ type: 'assistant.turn.completed', threadId, turn }, snapshotMessage(context)]);
};

const buildFailedActionTurn = (
  execution: PendingExecution,
  input: {
    status?: 'failed' | 'interrupted';
    error: string | null;
    live?: ReturnType<AssistantServiceRuntimeContext['state']['liveTurns']['get']>;
    localTurnId?: string;
  },
) => {
  const baseTurn = input.live?.turn ?? {
    id: input.localTurnId ?? execution.localTurnId,
    status: 'inProgress' as const,
    error: null,
    items: buildPendingUserItems(input.localTurnId ?? execution.localTurnId, execution),
    activeBuffer: execution.activeBuffer ?? null,
    resolvedSubject: execution.resolvedSubject ?? null,
    routing: execution.routing ?? null,
  };
  return {
    ...baseTurn,
    status: input.status ?? 'failed',
    error: input.error,
  };
};

const maybeInterruptUnknownTurn = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  executionThreadId: string,
  remoteTurnId: string,
) => {
  if (!context.state.interruptRequests.delete(threadId)) {
    return;
  }
  context.params.runAppServerTask(async () => {
    await context.params.callAppServer('turn/interrupt', { threadId: executionThreadId, turnId: remoteTurnId });
  });
};

const extractPersonaRewriteNote = (turn: RawTurn) => {
  const lastAgentMessage = [...turn.items]
    .reverse()
    .find((item): item is Extract<RawThreadItem, { type: 'agentMessage' }> => item.type === 'agentMessage');
  if (!lastAgentMessage || !lastAgentMessage.text.trim()) {
    return null;
  }
  const rawText = lastAgentMessage.text.trim();
  try {
    const parsed = JSON.parse(rawText) as { note?: unknown };
    if (typeof parsed.note === 'string' && parsed.note.trim()) {
      return normalizeText(parsed.note);
    }
  } catch {
    return normalizeText(rawText);
  }
  return null;
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^```(?:json|text)?\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();

const emptyActionContext = (): AssistantActionContext => ({
  networkId: null,
  networkName: null,
  personaNote: '',
});

const maybeInterruptKnownTurn = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  executionThreadId: string,
  remoteTurnId: string,
) => {
  if (!context.state.interruptRequests.delete(threadId)) {
    return;
  }
  context.params.runAppServerTask(async () => {
    await context.params.callAppServer('turn/interrupt', { threadId: executionThreadId, turnId: remoteTurnId });
  });
};
