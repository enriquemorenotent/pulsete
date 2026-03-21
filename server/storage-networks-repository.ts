import type { DatabaseSync } from 'node:sqlite';
import type { SecretBox } from './network-secret.js';
import {
  deleteNetwork,
  getNetwork,
  getRuntimeNetwork,
  listNetworks,
  upsertNetwork,
} from './storage-networks.js';
import { ensureNetworkBuffers } from './storage-network-invariants.js';
import { runInTransaction } from './storage-db.js';
import type { NetworkInput } from './storage-types.js';

export class StorageNetworksRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly secretBox: SecretBox,
  ) {}

  list() {
    return listNetworks(this.db);
  }

  get(networkId: string) {
    return getNetwork(this.db, networkId);
  }

  getRuntime(networkId: string) {
    return getRuntimeNetwork(this.db, networkId, this.secretBox);
  }

  delete(networkId: string) {
    runInTransaction(this.db, () => deleteNetwork(this.db, networkId));
  }

  upsert(input: NetworkInput) {
    return runInTransaction(this.db, () => {
      const network = upsertNetwork(this.db, input, this.secretBox);
      ensureNetworkBuffers(this.db, network);
      return network;
    });
  }
}
