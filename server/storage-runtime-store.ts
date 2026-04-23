import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageFriendsRepository } from './storage-friends-repository.js';
import type { StorageMutedNicksRepository } from './storage-muted-nicks-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import type { StorageSnapshotSource } from './storage-types.js';
import type { RuntimeStore } from './runtime-store-ports.js';

type StorageRepositories = {
  conversations: StorageConversationsRepository;
  friends: StorageFriendsRepository;
  mutedNicks: StorageMutedNicksRepository;
  networks: StorageNetworksRepository;
};

export const createStorageViews = (repositories: StorageRepositories) => {
  const snapshotSource: StorageSnapshotSource = {
    listBuffers: (networkId) => repositories.conversations.listBuffers(networkId),
    listChannels: (networkId) => repositories.conversations.listChannels(networkId),
    listFriends: () => repositories.friends.list(),
    listMutedNicks: (networkId) => repositories.mutedNicks.list(networkId),
    listNetworks: () => repositories.networks.list(),
    listRecentMessages: (limit) => repositories.conversations.listRecentMessages(limit),
  };
  const runtimeStore: RuntimeStore = {
    snapshotSource,
    conversations: repositories.conversations,
    friends: repositories.friends,
    mutedNicks: repositories.mutedNicks,
    networks: repositories.networks,
  };

  return { snapshotSource, runtimeStore };
};
