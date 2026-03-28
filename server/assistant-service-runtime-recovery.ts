import type { AssistantThreadSummary } from '../shared/protocol.js';
import { staleTurnFailureMessage } from './assistant-service-shared.js';
import { normalizeStoredAssistantTurns } from './assistant-service-turns.js';
import {
  failPersistedTurns,
  persistTurn,
} from './assistant-service-runtime-helpers.js';
import type { AssistantServiceRuntimeContext } from './assistant-service-runtime-types.js';

export const readThread = async (
  context: AssistantServiceRuntimeContext,
  summary: AssistantThreadSummary,
) => {
  const localTurns = context.params.assistant.getThreadTurns(summary.id) ?? [];
  const normalizedTurns = normalizeStoredAssistantTurns(summary.task, localTurns);
  if (normalizedTurns.changed) {
    context.params.assistant.saveThreadTurns(summary.id, normalizedTurns.turns);
  }
  return {
    ...summary,
    turns: normalizedTurns.turns,
  };
};

export const clearThreadState = (
  context: AssistantServiceRuntimeContext,
  threadId: string,
) => {
  context.state.pendingStarts.delete(threadId);
  for (const [turnId, live] of context.state.liveTurns.entries()) {
    if (live.threadId === threadId) {
      context.state.liveTurns.delete(turnId);
    }
  }
};

export const resetTransientState = (context: AssistantServiceRuntimeContext) => {
  context.state.pendingStarts.clear();
  context.state.executionThreads.clear();
  context.state.interruptRequests.clear();
  context.state.liveTurns.clear();
};

export const reconcilePersistedInProgressThreads = (
  context: AssistantServiceRuntimeContext,
) => {
  const updatedAt = Date.now();
  for (const thread of context.params.assistant.listThreads()) {
    if (thread.turnStatus !== 'inProgress') {
      continue;
    }
    failPersistedTurns(context, thread.id, staleTurnFailureMessage);
    context.params.assistant.upsertThread({
      ...thread,
      turnStatus: 'failed',
      updatedAt,
    });
  }
};

export const failInProgressTurns = (
  context: AssistantServiceRuntimeContext,
  error: Error | null,
) => {
  const failureMessage = error?.message ?? 'Assistant service became unavailable during the turn';
  const updatedAt = Date.now();
  const liveTurnIds = new Set(context.state.liveTurns.keys());
  const messages = [];
  for (const thread of context.params.assistant.listThreads()) {
    if (thread.turnStatus !== 'inProgress') {
      continue;
    }
    const storedFailedTurns = failPersistedTurns(context, thread.id, failureMessage);
    context.params.assistant.upsertThread({
      ...thread,
      turnStatus: 'failed',
      updatedAt,
    });
    for (const turn of storedFailedTurns) {
      if (!liveTurnIds.has(turn.id)) {
        messages.push({
          type: 'assistant.turn.completed' as const,
          threadId: thread.id,
          turn,
        });
      }
    }
  }
  return [
    ...messages,
    ...[...context.state.liveTurns.values()].map((live) => {
      const failedTurn = {
        ...live.turn,
        status: 'failed' as const,
        error: failureMessage,
      };
      persistTurn(context, live.threadId, failedTurn);
      return {
        type: 'assistant.turn.completed' as const,
        threadId: live.threadId,
        turn: failedTurn,
      };
    }),
  ];
};
