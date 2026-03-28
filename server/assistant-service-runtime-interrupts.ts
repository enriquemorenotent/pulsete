import type { AssistantServiceRuntimeContext } from './assistant-service-runtime-types.js';
import {
  findLiveTurn,
  hasPendingExecution,
} from './assistant-service-runtime-helpers.js';

export const interruptThread = async (
  context: AssistantServiceRuntimeContext,
  threadId: string,
) => {
  const live = findLiveTurn(context, threadId);
  if (live?.executionThreadId && live.remoteTurnId) {
    await context.params.callAppServer('turn/interrupt', {
      threadId: live.executionThreadId,
      turnId: live.remoteTurnId,
    });
    return;
  }
  if (live || hasPendingExecution(context, threadId)) {
    context.state.interruptRequests.add(threadId);
  }
};

export const interruptTurn = async (
  context: AssistantServiceRuntimeContext,
  threadId: string,
  turnId: string,
) => {
  const live = context.state.liveTurns.get(turnId);
  if (!live || live.threadId !== threadId) {
    return;
  }
  if (!live.executionThreadId || !live.remoteTurnId) {
    context.state.interruptRequests.add(threadId);
    return;
  }
  await context.params.callAppServer('turn/interrupt', {
    threadId: live.executionThreadId,
    turnId: live.remoteTurnId,
  });
};
