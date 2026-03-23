import type { RuntimeStore } from './runtime-service-types.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageFriendsRepository } from './storage-friends-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import type { StorageSnapshotSource } from './storage-types.js';

type StorageRepositories = {
  conversations: StorageConversationsRepository;
  friends: StorageFriendsRepository;
  networks: StorageNetworksRepository;
};

export const createStorageViews = (repositories: StorageRepositories) => {
  const snapshotSource: StorageSnapshotSource = {
    listBuffers: (networkId) => repositories.conversations.listBuffers(networkId),
    listChannels: (networkId) => repositories.conversations.listChannels(networkId),
    listFriends: () => repositories.friends.list(),
    listNetworks: () => repositories.networks.list(),
    listRecentMessages: (limit) => repositories.conversations.listRecentMessages(limit),
  };
  const runtimeStore: RuntimeStore = {
    snapshotSource,
    conversations: repositories.conversations,
    friends: repositories.friends,
    networks: repositories.networks,
  };

  return { snapshotSource, runtimeStore };
};
