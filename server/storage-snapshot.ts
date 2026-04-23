import { historyWindowLimit } from '../shared/protocol.js';
import type { AppSnapshot } from '../shared/protocol.js';
import type { StorageSnapshotSource } from './storage-types.js';

export const createStorageSnapshot = (store: StorageSnapshotSource): AppSnapshot => {
  const networks = store.listNetworks();
  return {
    networks,
    friends: store.listFriends(),
    mutedNicks: store.listMutedNicks(),
    friendPresence: {},
    queryPresence: {},
    buffers: store.listBuffers(),
    channels: store.listChannels(),
    pendingChannels: [],
    messages: store.listRecentMessages(historyWindowLimit),
    networkStates: {},
  };
};
