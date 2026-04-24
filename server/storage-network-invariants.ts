import type { SqliteDb } from './storage-sqlite.js';
import type { NetworkProfile } from '../shared/protocol.js';
import { upsertBuffer } from './storage-buffers.js';
import { listNetworks } from './storage-networks.js';

export const ensureServerBuffer = (db: SqliteDb, networkId: string) => {
  upsertBuffer(db, {
    networkId,
    kind: 'server',
    target: 'server',
  });
};

export const ensureNetworkBuffers = (db: SqliteDb, network: NetworkProfile) => {
  if (network.workspaceOpen) {
    ensureServerBuffer(db, network.id);
  }
};

export const ensureAllNetworkBuffers = (db: SqliteDb) => {
  for (const network of listNetworks(db).filter((item) => item.workspaceOpen)) {
    ensureServerBuffer(db, network.id);
  }
};
