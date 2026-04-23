import { createSecretBox, type SecretBox } from './network-secret.js';
import { createDatabase, runInTransaction } from './storage-db.js';
import { ensureAllNetworkBuffers, ensureNetworkBuffers } from './storage-network-invariants.js';
import {
  ensureDefaultNetworks,
  hasEncryptedNetworkPasswords,
  upsertNetwork,
} from './storage-networks.js';
import type { SqliteDb } from './storage-sqlite.js';
import type { NetworkInput } from './storage-types.js';

export type StorageBootstrapResources = {
  db: SqliteDb;
  secretBox: SecretBox;
};

export const openStorageResources = (filePath?: string): StorageBootstrapResources => {
  const db = createDatabase(filePath);
  const secretBox = createSecretBox(filePath, { createIfMissing: !hasEncryptedNetworkPasswords(db) });
  return { db, secretBox };
};

export const initializeStorageDefaults = ({ db, secretBox }: StorageBootstrapResources) => {
  runInTransaction(db, () => {
    ensureDefaultNetworks(db, (input) => saveNetworkWithServerBuffer(db, secretBox, input));
    ensureAllNetworkBuffers(db);
  });
};

const saveNetworkWithServerBuffer = (db: SqliteDb, secretBox: SecretBox, input: NetworkInput) => {
  const network = upsertNetwork(db, input, secretBox);
  ensureNetworkBuffers(db, network);
  return network;
};
