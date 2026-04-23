import { isConnectionInstance, listConnectionInstances } from '../shared/network-model.js';
import type { DatabaseSync } from 'node:sqlite';
import type { NetworkProfile } from '../shared/protocol.js';
import { upsertBuffer } from './storage-buffers.js';
import { listNetworks } from './storage-networks.js';

export const ensureServerBuffer = (db: DatabaseSync, networkId: string) => {
  upsertBuffer(db, {
    networkId,
    kind: 'server',
    target: 'server',
  });
};

export const ensureNetworkBuffers = (db: DatabaseSync, network: NetworkProfile) => {
  if (isConnectionInstance(network)) {
    ensureServerBuffer(db, network.id);
  }
};

export const ensureAllNetworkBuffers = (db: DatabaseSync) => {
  for (const network of listConnectionInstances(listNetworks(db))) {
    ensureServerBuffer(db, network.id);
  }
};
