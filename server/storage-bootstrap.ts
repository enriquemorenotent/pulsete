import { createSecretBox, type SecretBox } from './network-secret.js';
import { createDatabase, runInTransaction } from './storage-db.js';
import { ensureAllNetworkBuffers } from './storage-network-invariants.js';
import { hasEncryptedNetworkPasswords } from './storage-networks.js';
import type { AppPaths } from './app-paths.js';
import type { SqliteDb } from './storage-sqlite.js';

export type StorageBootstrapResources = {
  db: SqliteDb;
  secretBox: SecretBox;
};

export const openStorageResources = (paths: AppPaths): StorageBootstrapResources => {
  const db = createDatabase(paths.databasePath, paths.backupDirectory);
  const secretBox = createSecretBox(paths.networkSecretPath, {
    createIfMissing: !hasEncryptedNetworkPasswords(db),
  });
  return { db, secretBox };
};

export const initializeStorageDefaults = ({ db }: StorageBootstrapResources) => {
  runInTransaction(db, () => {
    ensureAllNetworkBuffers(db);
  });
};
