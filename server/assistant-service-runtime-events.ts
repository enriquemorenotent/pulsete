import { canonicalizeAssistantText } from '../shared/assistant-document.js';
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
  type RawThreadItem,
  type RawTurn,
} from './assistant-service-shared.js';
import {
  findLocalTurnId,
  persistTurn,
  resolveExecutionThreadOwner,
  snapshotMessage,
} from './assistant-service-runtime-helpers.js';
import type { AssistantServiceRuntimeContext } from './assistant-service-runtime-types.js';

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
