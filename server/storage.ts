import type { DatabaseSync } from 'node:sqlite';
import { initializeStorageDefaults, openStorageResources } from './storage-bootstrap.js';
import { StorageConversationsRepository } from './storage-conversations-repository.js';
import { StorageFriendsRepository } from './storage-friends-repository.js';
import { StorageNetworksRepository } from './storage-networks-repository.js';
import { createStorageViews } from './storage-runtime-store.js';
import { createStorageSnapshot } from './storage-snapshot.js';
import type { RuntimeStore } from './runtime-core.js';
import type { MessageInput, NetworkInput, StorageSnapshotSource } from './storage-types.js';

export { type MessageInput, type NetworkInput };

export class Storage {
  private readonly db: DatabaseSync;
  private readonly secretBox;
  private closed = false;
  readonly networks: StorageNetworksRepository;
  readonly conversations: StorageConversationsRepository;
  readonly friends: StorageFriendsRepository;
  readonly snapshotSource: StorageSnapshotSource;
  readonly runtimeStore: RuntimeStore;

  constructor(filePath?: string) {
    const resources = openStorageResources(filePath);
    this.db = resources.db;
    this.secretBox = resources.secretBox;
    initializeStorageDefaults(resources);
    this.networks = new StorageNetworksRepository(this.db, this.secretBox);
    this.conversations = new StorageConversationsRepository(this.db);
    this.friends = new StorageFriendsRepository(this.db);
    const views = createStorageViews({
      conversations: this.conversations,
      friends: this.friends,
      networks: this.networks,
    });
    this.snapshotSource = views.snapshotSource;
    this.runtimeStore = views.runtimeStore;
  }

  snapshot() {
    return createStorageSnapshot(this.snapshotSource);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
  }
}
