import type { StorageAvatarOverridesRepository } from './storage-avatar-overrides-repository.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageDraftsRepository } from './storage-drafts-repository.js';
import type { StorageFriendsRepository } from './storage-friends-repository.js';
import type { StorageMutedNicksRepository } from './storage-muted-nicks-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import type { StorageNickEmojisRepository } from './storage-nick-emojis-repository.js';
import type { StoragePreferencesRepository } from './storage-preferences-repository.js';
import type { StorageSnapshotSource } from './storage-types.js';

export type RuntimeNetworkCatalog = Pick<StorageNetworksRepository, 'list'>;
export type RuntimeConversationStore = StorageConversationsRepository;
export type RuntimeFriendStore = StorageFriendsRepository;
export type RuntimeMutedNickStore = StorageMutedNicksRepository;
export type RuntimeNetworkStore = StorageNetworksRepository;
export type RuntimeNickEmojiStore = StorageNickEmojisRepository;

export type RuntimeStore = {
  snapshotSource: StorageSnapshotSource;
  conversations: StorageConversationsRepository;
  friends: StorageFriendsRepository;
  mutedNicks: StorageMutedNicksRepository;
  networks: StorageNetworksRepository;
  nickEmojis: StorageNickEmojisRepository;
  preferences: StoragePreferencesRepository;
  drafts: StorageDraftsRepository;
  avatarOverrides: StorageAvatarOverridesRepository;
};
