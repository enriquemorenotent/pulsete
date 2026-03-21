import { isConnectionInstance } from '../shared/network-model.js';
import { getServerBuffer, upsertBuffer } from './storage-buffers.js';
import type { DatabaseSync } from 'node:sqlite';
import type { NetworkProfile } from '../shared/protocol.js';

export const ensureNetworkBuffers = (db: DatabaseSync, network: NetworkProfile) => {
  if (!isConnectionInstance(network) || getServerBuffer(db, network.id)) {
    return;
  }
  upsertBuffer(db, {
    networkId: network.id,
    kind: 'server',
    target: 'server',
  });
};
