import type { StorageAssistantRepository } from './storage-assistant-repository.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageFriendsRepository } from './storage-friends-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import type { StorageSnapshotSource } from './storage-types.js';
import type { RuntimeStore } from './runtime-store-ports.js';

type StorageRepositories = {
  assistant: StorageAssistantRepository;
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
    listAssistantThreads: () => repositories.assistant.listThreads(),
    getAssistantPreferences: () => repositories.assistant.getPreferences(),
  };
  const runtimeStore: RuntimeStore = {
    snapshotSource,
    assistant: repositories.assistant,
    conversations: repositories.conversations,
    friends: repositories.friends,
    networks: repositories.networks,
  };

  return { snapshotSource, runtimeStore };
};
