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
import { createStorageViews } from './storage-runtime-store.js';
import { createStorageSnapshot } from './storage-snapshot.js';
import type { RuntimeStore } from './runtime-service-types.js';
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
  readonly runtimeStore: RuntimeStore;

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
    const views = createStorageViews({
      conversations: this.conversations,
      friends: this.friends,
      mutedNicks: this.mutedNicks,
      networks: this.networks,
      nickEmojis: this.nickEmojis,
    });
    this.snapshotSource = views.snapshotSource;
    this.runtimeStore = views.runtimeStore;
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
