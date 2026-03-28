import type {
  AssistantThreadSummary,
  AssistantTurn,
} from '../shared/protocol.js';
import type { LiveTurnState } from './assistant-service-shared.js';
import { upsertTurn } from './assistant-service-turns.js';
import type { AssistantServiceRuntimeContext } from './assistant-service-runtime-types.js';

export const resolveExecutionThreadOwner = (
  context: AssistantServiceRuntimeContext,
  executionThreadId: string,
) => {
  const execution = context.state.executionThreads.get(executionThreadId);
  if (execution) {
    return execution.threadId;
  }
  for (const live of context.state.liveTurns.values()) {
    if (live.executionThreadId === executionThreadId) {
      return live.threadId;
    }
  }
  return executionThreadId;
};

export const persistTurn = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  turn: AssistantTurn,
) => {
  const turns = context.params.assistant.getThreadTurns(threadId) ?? [];
  context.params.assistant.saveThreadTurns(threadId, upsertTurn(turns, turn));
};

export const failPersistedTurns = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  failureMessage: string,
) => {
  const turns = context.params.assistant.getThreadTurns(threadId) ?? [];
  const changedTurns: AssistantTurn[] = [];
  const nextTurns = turns.map((turn) => {
    if (turn.status !== 'inProgress') {
      return turn;
    }
    const failedTurn = {
      ...turn,
      status: 'failed' as const,
      error: failureMessage,
    };
    changedTurns.push(failedTurn);
    return failedTurn;
  });
  if (changedTurns.length === 0) {
    return [] as AssistantTurn[];
  }
  context.params.assistant.saveThreadTurns(threadId, nextTurns);
  return changedTurns;
};

export const hasLiveExecution = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
) => {
  for (const execution of context.state.executionThreads.values()) {
    if (execution.threadId === threadId) {
      return true;
    }
  }
  for (const live of context.state.liveTurns.values()) {
    if (live.threadId === threadId) {
      return true;
    }
  }
  return false;
};

export const hasPendingExecution = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
) => {
  if (context.state.pendingStarts.has(threadId)) {
    return true;
  }
  for (const execution of context.state.executionThreads.values()) {
    if (execution.threadId === threadId) {
      return true;
    }
  }
  return false;
};

export const findLiveTurn = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
): LiveTurnState | null => {
  for (const live of context.state.liveTurns.values()) {
    if (live.threadId === threadId) {
      return live;
    }
  }
  return null;
};

export const discardPendingExecution = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  localTurnId: string,
) => {
  if (context.state.pendingStarts.get(threadId)?.localTurnId === localTurnId) {
    context.state.pendingStarts.delete(threadId);
  }
  for (const [executionThreadId, execution] of context.state.executionThreads.entries()) {
    if (execution.threadId === threadId && execution.localTurnId === localTurnId) {
      context.state.executionThreads.delete(executionThreadId);
    }
  }
};

export const findLocalTurnId = (
  context: AssistantServiceRuntimeContext,
  executionThreadId: string,
  remoteTurnId: string,
) => {
  const execution = context.state.executionThreads.get(executionThreadId);
  if (execution) {
    return execution.localTurnId;
  }
  for (const [localTurnId, live] of context.state.liveTurns.entries()) {
    if (
      live.executionThreadId === executionThreadId
      || live.remoteTurnId === remoteTurnId
      || live.turn.id === remoteTurnId
    ) {
      return localTurnId;
    }
  }
  return null;
};

export const requireThread = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
): AssistantThreadSummary => {
  const thread = context.params.assistant.getThread(threadId);
  if (!thread) {
    throw new Error(`Unknown assistant thread: ${threadId}`);
  }
  return thread;
};

export const snapshotMessage = (context: AssistantServiceRuntimeContext) => ({
  type: 'assistant.snapshot' as const,
  assistant: context.params.snapshot(),
});
