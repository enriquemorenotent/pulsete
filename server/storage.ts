import { initializeStorageDefaults, openStorageResources } from './storage-bootstrap.js';
import {
  createStorageBackup,
  type BrowserPreferences,
} from './storage-backup.js';
import { resolveAppPaths, type AppPaths } from './app-paths.js';
import { StorageConversationsRepository } from './storage-conversations-repository.js';
import { StorageFriendsRepository } from './storage-friends-repository.js';
import { StorageMutedNicksRepository } from './storage-muted-nicks-repository.js';
import { StorageNetworksRepository } from './storage-networks-repository.js';
import { StorageNickEmojisRepository } from './storage-nick-emojis-repository.js';
import { StoragePreferencesRepository } from './storage-preferences-repository.js';
import { StorageDraftsRepository } from './storage-drafts-repository.js';
import { StorageAvatarOverridesRepository } from './storage-avatar-overrides-repository.js';
import { createStorageSnapshot } from './storage-snapshot.js';
import type { SqliteDb } from './storage-sqlite.js';
import type { MessageInput, NetworkInput, StorageSnapshotSource } from './storage-types.js';

export { type MessageInput, type NetworkInput };

export class Storage {
  private readonly db: SqliteDb;
  private readonly secretBox;
  private readonly paths: AppPaths;
  private closed = false;
  readonly databasePath: string;
  readonly networks: StorageNetworksRepository;
  readonly conversations: StorageConversationsRepository;
  readonly friends: StorageFriendsRepository;
  readonly mutedNicks: StorageMutedNicksRepository;
  readonly snapshotSource: StorageSnapshotSource;
  readonly nickEmojis: StorageNickEmojisRepository;
  readonly preferences: StoragePreferencesRepository;
  readonly drafts: StorageDraftsRepository;
  readonly avatarOverrides: StorageAvatarOverridesRepository;

  constructor(paths: AppPaths | string) {
    this.paths = typeof paths === 'string' ? resolveAppPaths({ databasePath: paths }) : paths;
    this.databasePath = this.paths.databasePath;
    const resources = openStorageResources(this.paths);
    this.db = resources.db;
    this.secretBox = resources.secretBox;
    initializeStorageDefaults(resources);
    this.networks = new StorageNetworksRepository(this.db, this.secretBox);
    this.conversations = new StorageConversationsRepository(this.db);
    this.friends = new StorageFriendsRepository(this.db);
    this.mutedNicks = new StorageMutedNicksRepository(this.db);
    this.nickEmojis = new StorageNickEmojisRepository(this.db);
    this.preferences = new StoragePreferencesRepository(this.db);
    this.drafts = new StorageDraftsRepository(this.db);
    this.avatarOverrides = new StorageAvatarOverridesRepository(this.db);
    this.snapshotSource = {
      listBuffers: (networkId) => this.conversations.listBuffers(networkId),
      listChannels: (networkId) => this.conversations.listChannels(networkId),
      listFriends: () => this.friends.list(),
      listMutedNicks: (networkId) => this.mutedNicks.list(networkId),
      listNetworks: () => this.networks.list(),
      listNickEmojis: (networkId) => this.nickEmojis.list(networkId),
      getPreferences: () => this.preferences.get(),
      isLegacyBrowserImportPending: () => this.preferences.isLegacyBrowserImportPending(),
      listDrafts: () => this.drafts.list(),
      listAvatarOverrides: () => this.avatarOverrides.list(),
      listRecentMessages: (limit) => this.conversations.listRecentMessages(limit),
      listRecentMessagesForBufferIds: (bufferIds, limit) =>
        this.conversations.listRecentMessagesForBufferIds(bufferIds, limit),
    };
  }

  snapshot() {
    return createStorageSnapshot(this.snapshotSource);
  }

  exportBackup(browserPreferences: BrowserPreferences) {
    return createStorageBackup({
      browserPreferences,
      db: this.db,
      paths: this.paths,
    });
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
  }
}
