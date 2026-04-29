import type { ServerMessage } from '../../shared/protocol.js';
import type { AppStoreApi } from './app-store.js';
import type { Action } from './app-types.js';
import { dispatchInboundServerMessage } from './server-message-actions.js';

type MutationEchoEntry = {
  count: number;
  expiresAt: number;
};

type MutationEchoStore = Map<string, MutationEchoEntry>;

type MutationEchoSettings = {
  maxTrackedMutationIds: number;
  mutationEchoTtlMs: number;
  now: () => number;
};

type ServerMessageBridgeOptions = Partial<{
  maxTrackedMutationIds: number;
  mutationEchoTtlMs: number;
  now: () => number;
}>;

const defaultMutationEchoTtlMs = 30_000;
const defaultMaxTrackedMutationIds = 500;

const resolveMutationEchoSettings = (
  options: ServerMessageBridgeOptions,
): MutationEchoSettings => ({
  maxTrackedMutationIds: Math.max(
    1,
    Math.floor(options.maxTrackedMutationIds ?? defaultMaxTrackedMutationIds),
  ),
  mutationEchoTtlMs: Math.max(
    1,
    Math.floor(options.mutationEchoTtlMs ?? defaultMutationEchoTtlMs),
  ),
  now: options.now ?? Date.now,
});

const pruneExpiredMutationEchoes = (
  store: MutationEchoStore,
  now: number,
) => {
  for (const [mutationId, entry] of store) {
    if (entry.expiresAt > now) {
      continue;
    }
    store.delete(mutationId);
  }
};

const trimTrackedMutationEchoes = (
  store: MutationEchoStore,
  maxTrackedMutationIds: number,
) => {
  while (store.size > maxTrackedMutationIds) {
    const oldestMutationId = store.keys().next().value as string | undefined;
    if (!oldestMutationId) {
      return;
    }
    store.delete(oldestMutationId);
  }
};

const trackMutationEcho = (
  store: MutationEchoStore,
  mutationId: string,
  settings: MutationEchoSettings,
  now = settings.now(),
) => {
  pruneExpiredMutationEchoes(store, now);
  const count = (store.get(mutationId)?.count ?? 0) + 1;
  store.delete(mutationId);
  store.set(mutationId, {
    count,
    expiresAt: now + settings.mutationEchoTtlMs,
  });
  trimTrackedMutationEchoes(store, settings.maxTrackedMutationIds);
};

const consumeMutationEcho = (
  store: MutationEchoStore,
  mutationId: string,
  settings: MutationEchoSettings,
  now = settings.now(),
) => {
  pruneExpiredMutationEchoes(store, now);
  const entry = store.get(mutationId);
  if (!entry) {
    return false;
  }
  store.delete(mutationId);
  if (entry.count > 1) {
    store.set(mutationId, {
      count: entry.count - 1,
      expiresAt: now + settings.mutationEchoTtlMs,
    });
  }
  return true;
};

const trackPendingMutationEchoes = (
  pendingMutations: MutationEchoStore,
  seenSocketMutations: MutationEchoStore,
  settings: MutationEchoSettings,
  messages: readonly ServerMessage[],
) => {
  const now = settings.now();
  const messagesToDispatch: ServerMessage[] = [];
  for (const message of messages) {
    if (!message.mutationId) {
      messagesToDispatch.push(message);
      continue;
    }
    if (consumeMutationEcho(seenSocketMutations, message.mutationId, settings, now)) {
      continue;
    }
    trackMutationEcho(pendingMutations, message.mutationId, settings, now);
    messagesToDispatch.push(message);
  }
  return messagesToDispatch;
};

const consumePendingMutationEcho = (
  pendingMutations: MutationEchoStore,
  settings: MutationEchoSettings,
  message: ServerMessage,
) => {
  if (!message.mutationId) {
    return false;
  }
  return consumeMutationEcho(pendingMutations, message.mutationId, settings);
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

export const createServerMessageBridge = (
  target: DispatchTarget,
  options: ServerMessageBridgeOptions = {},
) => {
  const settings = resolveMutationEchoSettings(options);
  const pendingMutations: MutationEchoStore = new Map();
  const seenSocketMutations: MutationEchoStore = new Map();
  const dispatch = readDispatch(target);

  const applyMutationMessages = (messages: readonly ServerMessage[]) => {
    const messagesToDispatch = trackPendingMutationEchoes(
      pendingMutations,
      seenSocketMutations,
      settings,
      messages,
    );
    runBatched(target, () => {
      for (const message of messagesToDispatch) {
        dispatchInboundServerMessage(message, dispatch);
      }
    });
  };

  const applySocketMessage = (message: ServerMessage) => {
    if (consumePendingMutationEcho(pendingMutations, settings, message)) {
      return;
    }
    runBatched(target, () => {
      dispatchInboundServerMessage(message, dispatch);
    });
    if (message.mutationId) {
      trackMutationEcho(seenSocketMutations, message.mutationId, settings);
    }
  };

  return {
    applyMutationMessages,
    applySocketMessage,
  };
};
