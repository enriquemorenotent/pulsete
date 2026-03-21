import { historyWindowLimit } from '../shared/protocol.js';
import type { StorageSnapshotSource } from './storage-types.js';

export const createStorageSnapshot = (store: StorageSnapshotSource) => {
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
  };
};
