import { historyWindowLimit } from '../shared/protocol.js';
import type { AssistantSnapshot, AppSnapshot } from '../shared/protocol.js';
import type { StorageSnapshotSource } from './storage-types.js';

export const createStorageAssistantSnapshot = (store: StorageSnapshotSource): AssistantSnapshot => {
  const preferences = store.getAssistantPreferences();
  return {
    serviceStatus: 'starting' as const,
    serviceError: null,
    auth: {
      requiresOpenaiAuth: true,
      account: null,
      pendingLoginId: null,
      pendingAuthUrl: null,
      lastError: null,
    },
    rateLimits: null,
    rateLimitBuckets: [],
    models: [],
    defaultModel: preferences.defaultModel,
    activeThreadId: preferences.activeThreadId,
    threads: store.listAssistantThreads(),
  };
};

export const createStorageSnapshot = (store: StorageSnapshotSource): AppSnapshot => {
  const networks = store.listNetworks();
  return {
    networks,
    friends: store.listFriends(),
    friendPresence: {},
    buffers: store.listBuffers(),
    channels: store.listChannels(),
    pendingChannels: [],
    messages: store.listRecentMessages(historyWindowLimit),
    networkStates: {},
    assistant: createStorageAssistantSnapshot(store),
  };
};
