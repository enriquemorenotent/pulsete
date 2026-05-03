import { historyWindowLimit } from '../shared/protocol-chat.js';
import type { AppSnapshot } from '../shared/protocol-app.js';
import type { StorageSnapshotSource } from './storage-types.js';

export const createStorageSnapshot = (store: StorageSnapshotSource): AppSnapshot => {
  const networks = store.listNetworks();
  const workspaceNetworkIds = new Set(networks.filter((network) => network.workspaceOpen).map((network) => network.id));
  const isWorkspaceItem = (item: { networkId: string }) => workspaceNetworkIds.has(item.networkId);
  const buffers = store.listBuffers().filter(isWorkspaceItem);
  return {
    networks,
    friends: store.listFriends(),
    mutedNicks: store.listMutedNicks(),
    nickEmojis: store.listNickEmojis(),
    friendPresence: {},
    queryPresence: {},
    buffers,
    channels: store.listChannels().filter(isWorkspaceItem),
    pendingChannels: [],
    messages: store.listRecentMessagesForBufferIds(
      buffers.map((buffer) => buffer.id),
      historyWindowLimit
    ),
    networkStates: {},
  };
};
