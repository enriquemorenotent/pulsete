import { historyWindowLimit } from '../shared/protocol.js';
import type { Storage } from './storage.js';

type StorageSnapshotSource = Pick<
  Storage,
  'listBuffers' | 'listChannels' | 'listFriends' | 'listNetworks' | 'listRecentMessages'
>;

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
