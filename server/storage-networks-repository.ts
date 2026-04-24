import type { SecretBox } from './network-secret.js';
import {
  deleteNetwork,
  getNetwork,
  getRuntimeNetwork,
  listNetworks,
  setWorkspaceOpen,
  upsertNetwork,
} from './storage-networks.js';
import { ensureNetworkBuffers } from './storage-network-invariants.js';
import { runInTransaction } from './storage-db.js';
import type { SqliteDb } from './storage-sqlite.js';
import type { NetworkInput } from './storage-types.js';

export class StorageNetworksRepository {
  constructor(
    private readonly db: SqliteDb,
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
    return runInTransaction(this.db, () => {
      const existing = getNetwork(this.db, networkId);
      if (!existing) {
        return [];
      }
      deleteNetwork(this.db, networkId);
      return [networkId];
    });
  }

  setWorkspaceOpen(networkId: string, workspaceOpen: boolean) {
    return runInTransaction(this.db, () => {
      const network = setWorkspaceOpen(this.db, networkId, workspaceOpen);
      if (network?.workspaceOpen) {
        ensureNetworkBuffers(this.db, network);
      }
      return network;
    });
  }

  upsert(input: NetworkInput) {
    return runInTransaction(this.db, () => {
      const network = upsertNetwork(this.db, input, this.secretBox);
      ensureNetworkBuffers(this.db, network);
      return network;
    });
  }

  save(input: NetworkInput) {
    return runInTransaction(this.db, () => {
      const network = upsertNetwork(this.db, input, this.secretBox);
      ensureNetworkBuffers(this.db, network);
      return network;
    });
  }
}
