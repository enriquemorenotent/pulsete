import { isConnectionInstance } from '../shared/network-model.js';
import type { NetworkProfile, ServerMessage } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import { parseNetworkInput } from './network-input.js';
import { createRuntimeCommandResult, type RuntimeCommandResult, type RuntimeOperationContext } from './runtime-operation-types.js';
import { createDuplicateNetworkName, getRequiredNetwork, getRequiredRuntimeNetwork } from './runtime-operation-utils.js';
import type { NetworkInput } from './storage.js';

type NetworkLifecycleContext = Pick<RuntimeOperationContext, 'connectionManager' | 'store'>;

export class NetworkLifecycleService {
  constructor(private readonly context: NetworkLifecycleContext) {}

  duplicateNetwork(networkId: string) {
    const network = getRequiredNetwork(this.context.store, networkId);
    if (isConnectionInstance(network)) {
      throw badRequest('Only saved networks can be duplicated');
    }
    const runtimeProfile = getRequiredRuntimeNetwork(this.context.store, networkId);
    const duplicate = this.context.store.upsertNetwork({
      templateId: null,
      managerHidden: false,
      name: createDuplicateNetworkName(network.name, this.context.store.listNetworks()),
      host: network.host,
      port: network.port,
      tls: network.tls,
      nick: network.nick,
      altNicks: network.altNicks,
      username: network.username,
      realName: network.realName,
      password: runtimeProfile.password,
      favorite: network.favorite,
      autoJoin: network.autoJoin,
    });
    return createRuntimeCommandResult(
      { network: duplicate, serverBuffer: null },
      [{ type: 'network.upsert', network: duplicate }]
    );
  }

  saveNetwork(data: unknown, networkId?: string) {
    const input = parseNetworkInput(data, networkId);
    if (networkId) {
      getRequiredNetwork(this.context.store, networkId);
    }
    const network = this.context.store.upsertNetwork(input);
    const updatedProfiles = [network, ...this.syncTemplateInstances(network, input)];
    const serverBuffer = this.collectServerBuffer(network.id, updatedProfiles);
    const messages = this.createUpsertMessages(updatedProfiles);
    this.context.connectionManager.updateProfiles(updatedProfiles.map((profile) => profile.id));
    return createRuntimeCommandResult({ network, serverBuffer }, messages);
  }

  deleteNetwork(networkId: string): RuntimeCommandResult<string[]> {
    const deletedNetworkIds = this.getRelatedNetworkIds(networkId);
    if (deletedNetworkIds.length === 0) {
      throw notFound('Network not found');
    }
    const messages = this.context.connectionManager.removeNetworks(deletedNetworkIds);
    this.context.store.deleteNetwork(networkId);
    for (const targetId of deletedNetworkIds) {
      messages.push({ type: 'network.remove', networkId: targetId });
    }
    return createRuntimeCommandResult(deletedNetworkIds, messages);
  }

  private collectServerBuffer(requestedNetworkId: string, profiles: NetworkProfile[]) {
    for (const profile of profiles) {
      if (!isConnectionInstance(profile)) {
        continue;
      }
      const serverBuffer = this.context.store.getServerBuffer(profile.id);
      if (profile.id === requestedNetworkId) {
        return serverBuffer;
      }
    }
    return null;
  }

  private createUpsertMessages(profiles: NetworkProfile[]): ServerMessage[] {
    const messages: ServerMessage[] = [];
    for (const profile of profiles) {
      if (isConnectionInstance(profile)) {
        const serverBuffer = this.context.store.getServerBuffer(profile.id);
        if (serverBuffer) {
          messages.push({ type: 'buffer.upsert', buffer: serverBuffer });
        }
      }
      messages.push({ type: 'network.upsert', network: profile });
    }
    return messages;
  }

  private getRelatedNetworkIds(networkId: string) {
    return this.context.store
      .listNetworks()
      .filter((candidate) => candidate.id === networkId || (isConnectionInstance(candidate) && candidate.templateId === networkId))
      .map((candidate) => candidate.id);
  }

  private syncTemplateInstances(profile: NetworkProfile, input: NetworkInput) {
    if (isConnectionInstance(profile)) {
      return [];
    }
    return this.context.store
      .listNetworks()
      .filter((candidate) => isConnectionInstance(candidate) && candidate.templateId === profile.id)
      .map((candidate) =>
        this.context.store.upsertNetwork({
          id: candidate.id,
          templateId: profile.id,
          managerHidden: true,
          name: profile.name,
          host: profile.host,
          port: profile.port,
          tls: profile.tls,
          nick: profile.nick,
          altNicks: profile.altNicks,
          username: profile.username,
          realName: profile.realName,
          favorite: profile.favorite,
          autoJoin: profile.autoJoin,
          ...(input.password !== undefined ? { password: input.password } : {}),
          ...(input.clearPassword ? { clearPassword: true } : {}),
        })
      );
  }
}
