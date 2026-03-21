import type { DatabaseSync } from 'node:sqlite';
import { isConnectionInstance } from '../shared/network-model.js';
import { createSecretBox, type SecretBox } from './network-secret.js';
import { getServerBuffer, upsertBuffer } from './storage-buffers.js';
import { createDatabase, runInTransaction } from './storage-db.js';
import {
  ensureDefaultNetworks,
  hasEncryptedNetworkPasswords,
  listNetworks,
  migrateLegacyNetworkPasswords,
  upsertNetwork,
} from './storage-networks.js';
import type { NetworkInput } from './storage-types.js';

export type StorageBootstrapResources = {
  db: DatabaseSync;
  secretBox: SecretBox;
};

export const openStorageResources = (filePath?: string): StorageBootstrapResources => {
  const db = createDatabase(filePath);
  const secretBox = createSecretBox(filePath, { createIfMissing: !hasEncryptedNetworkPasswords(db) });
  migrateLegacyNetworkPasswords(db, secretBox);
  return { db, secretBox };
};

export const initializeStorageDefaults = ({ db, secretBox }: StorageBootstrapResources) => {
  runInTransaction(db, () => {
    ensureDefaultNetworks(db, (input) => saveNetworkWithServerBuffer(db, secretBox, input));
    ensureServerBuffers(db);
  });
};

const ensureServerBuffers = (db: DatabaseSync) => {
  for (const network of listNetworks(db).filter(isConnectionInstance)) {
    ensureServerBuffer(db, network.id);
  }
};

const saveNetworkWithServerBuffer = (db: DatabaseSync, secretBox: SecretBox, input: NetworkInput) => {
  const network = upsertNetwork(db, input, secretBox);
  if (isConnectionInstance(network)) {
    ensureServerBuffer(db, network.id);
  }
  return network;
};

const ensureServerBuffer = (db: DatabaseSync, networkId: string) => {
  if (!getServerBuffer(db, networkId)) {
    upsertBuffer(db, {
      networkId,
      kind: 'server',
      target: 'server',
    });
  }
};
