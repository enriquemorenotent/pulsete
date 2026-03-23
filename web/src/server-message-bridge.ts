import type { ServerMessage } from '../../shared/protocol.js';
import type { Action } from './app-types.js';
import { dispatchInboundServerMessage } from './server-message-actions.js';

const mutationEchoWindowMs = 1_500;
const maxPendingEchoes = 200;

const messageSignature = (message: ServerMessage) => JSON.stringify(message);

const pruneExpiredEchoes = (pendingEchoes: Map<string, number>, now: number) => {
  for (const [signature, expiresAt] of pendingEchoes) {
    if (expiresAt > now) {
      continue;
    }
    pendingEchoes.delete(signature);
  }

  while (pendingEchoes.size > maxPendingEchoes) {
    const oldest = pendingEchoes.keys().next().value;
    if (!oldest) {
      return;
    }
    pendingEchoes.delete(oldest);
  }
};

export const createServerMessageBridge = (dispatch: (action: Action) => void) => {
  const pendingEchoes = new Map<string, number>();

  const applyMutationMessages = (messages: readonly ServerMessage[]) => {
    const now = Date.now();
    pruneExpiredEchoes(pendingEchoes, now);
    for (const message of messages) {
      pendingEchoes.set(messageSignature(message), now + mutationEchoWindowMs);
      dispatchInboundServerMessage(message, dispatch);
    }
  };

  const applySocketMessage = (message: ServerMessage) => {
    const now = Date.now();
    pruneExpiredEchoes(pendingEchoes, now);
    const signature = messageSignature(message);
    const pendingExpiry = pendingEchoes.get(signature);
    if (pendingExpiry && pendingExpiry >= now) {
      pendingEchoes.delete(signature);
      return;
    }
    dispatchInboundServerMessage(message, dispatch);
  };

  return {
    applyMutationMessages,
    applySocketMessage,
  };
};
