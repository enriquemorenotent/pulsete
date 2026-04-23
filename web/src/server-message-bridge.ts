import type { ServerMessage } from '../../shared/protocol.js';
import type { AppStoreApi } from './app-store.js';
import type { Action } from './app-types.js';
import { dispatchInboundServerMessage } from './server-message-actions.js';

const trackPendingMutationEchoes = (
  pendingMutations: Map<string, number>,
  messages: readonly ServerMessage[]
) => {
  for (const message of messages) {
    if (!message.mutationId) {
      continue;
    }
    pendingMutations.set(message.mutationId, (pendingMutations.get(message.mutationId) ?? 0) + 1);
  }
};

const consumePendingMutationEcho = (
  pendingMutations: Map<string, number>,
  message: ServerMessage
) => {
  if (!message.mutationId) {
    return false;
  }
  const pendingCount = pendingMutations.get(message.mutationId);
  if (!pendingCount) {
    return false;
  }
  if (pendingCount === 1) {
    pendingMutations.delete(message.mutationId);
  } else {
    pendingMutations.set(message.mutationId, pendingCount - 1);
  }
  return true;
};

type DispatchTarget =
  | ((action: Action) => void)
  | Pick<AppStoreApi, 'batch' | 'dispatch'>;

const runBatched = (target: DispatchTarget, callback: () => void) => {
  if (typeof target === 'function') {
    callback();
    return;
  }
  target.batch(callback);
};

const readDispatch = (target: DispatchTarget) =>
  typeof target === 'function' ? target : target.dispatch;

export const createServerMessageBridge = (target: DispatchTarget) => {
  const pendingMutations = new Map<string, number>();
  const dispatch = readDispatch(target);

  const applyMutationMessages = (messages: readonly ServerMessage[]) => {
    trackPendingMutationEchoes(pendingMutations, messages);
    runBatched(target, () => {
      for (const message of messages) {
        dispatchInboundServerMessage(message, dispatch);
      }
    });
  };

  const applySocketMessage = (message: ServerMessage) => {
    if (consumePendingMutationEcho(pendingMutations, message)) {
      return;
    }
    runBatched(target, () => {
      dispatchInboundServerMessage(message, dispatch);
    });
  };

  return {
    applyMutationMessages,
    applySocketMessage,
  };
};
