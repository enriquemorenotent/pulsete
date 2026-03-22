import type { DatabaseSync } from 'node:sqlite';
import type { SecretBox } from './network-secret.js';
import type { ConnectionInstanceProfile } from '../shared/network-model.js';
import { isConnectionInstance } from '../shared/network-model.js';
import {
  deleteNetwork,
  getNetwork,
  getRuntimeNetwork,
  listNetworks,
  upsertNetwork,
} from './storage-networks.js';
import { ensureNetworkBuffers } from './storage-network-invariants.js';
import { runInTransaction } from './storage-db.js';
import type { NetworkInput, NetworkSaveResult } from './storage-types.js';

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

  saveWithRelatedInstances(input: NetworkInput): NetworkSaveResult {
    return runInTransaction(this.db, () => {
      const network = upsertNetwork(this.db, input, this.secretBox);
      ensureNetworkBuffers(this.db, network);
      if (isConnectionInstance(network)) {
        return { requested: network, relatedInstances: [] };
      }
      const relatedInstances: ConnectionInstanceProfile[] = [];
      for (const candidate of listNetworks(this.db)) {
        if (!isConnectionInstance(candidate) || candidate.templateId !== network.id) {
          continue;
        }
        const updated = upsertNetwork(this.db, {
          id: candidate.id,
          templateId: network.id,
          managerHidden: true,
          name: network.name,
          host: network.host,
          port: network.port,
          tls: network.tls,
          nick: network.nick,
          altNicks: network.altNicks,
          username: network.username,
          realName: network.realName,
          favorite: network.favorite,
          autoJoin: network.autoJoin,
          ...(input.password !== undefined ? { password: input.password } : {}),
          ...(input.clearPassword ? { clearPassword: true } : {}),
        }, this.secretBox);
        if (!isConnectionInstance(updated)) {
          throw new Error('Expected related connection instance update');
        }
        ensureNetworkBuffers(this.db, updated);
        relatedInstances.push(updated);
      }
      return { requested: network, relatedInstances };
    });
  }

  deleteWithRelated(networkId: string) {
    return runInTransaction(this.db, () => {
      const relatedNetworkIds = listNetworks(this.db)
        .filter((candidate) => candidate.id === networkId || (isConnectionInstance(candidate) && candidate.templateId === networkId))
        .map((candidate) => candidate.id);
      if (relatedNetworkIds.length === 0) {
        return [];
      }
      deleteNetwork(this.db, networkId);
      return relatedNetworkIds;
    });
  }
}
