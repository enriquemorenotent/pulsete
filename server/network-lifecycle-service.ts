import { isConnectionInstance } from '../shared/network-model.js';
import type { ServerMessage } from '../shared/protocol.js';
import { collectRequestedServerBuffer, createNetworkRemoveMessages, createNetworkUpsertMessages } from './network-lifecycle-messages.js';
import { listRelatedNetworkIds, syncTemplateInstances } from './network-template-sync.js';
import { badRequest, notFound } from './app-error.js';
import { createDuplicateNetworkName } from './network-name-utils.js';
import { parseNetworkInput } from './network-input.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';

type NetworkLifecycleContext = {
  connectionManager: RuntimeConnectionManager;
  conversations: StorageConversationsRepository;
  networks: StorageNetworksRepository;
  publish(messages: readonly ServerMessage[]): void;
};

export class NetworkLifecycleService {
  constructor(private readonly context: NetworkLifecycleContext) {}

  duplicateNetwork(networkId: string) {
    const result = this.duplicateNetworkResult(networkId);
    return { network: result.network, serverBuffer: result.serverBuffer };
  }

  duplicateNetworkResult(networkId: string) {
    const network = this.context.networks.get(networkId);
    if (!network) {
      throw notFound('Network not found');
    }
    if (isConnectionInstance(network)) {
      throw badRequest('Only saved networks can be duplicated');
    }
    const runtimeProfile = this.context.networks.getRuntime(networkId);
    if (!runtimeProfile) {
      throw notFound('Network not found');
    }
    const duplicate = this.context.networks.upsert({
      templateId: null,
      managerHidden: false,
      name: createDuplicateNetworkName(network.name, this.context.networks.list()),
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
    const messages = [{ type: 'network.upsert', network: duplicate } satisfies ServerMessage];
    this.context.publish(messages);
    return { network: duplicate, serverBuffer: null, messages };
  }

  saveNetwork(data: unknown, networkId?: string) {
    const result = this.saveNetworkResult(data, networkId);
    return { network: result.network, serverBuffer: result.serverBuffer };
  }

  saveNetworkResult(data: unknown, networkId?: string) {
    const input = parseNetworkInput(data, networkId);
    if (networkId && !this.context.networks.get(networkId)) {
      throw notFound('Network not found');
    }
    const network = this.context.networks.upsert(input);
    const updatedProfiles = [network, ...syncTemplateInstances(this.context.networks, network, input)];
    const serverBuffer = collectRequestedServerBuffer(this.context.conversations, network.id, updatedProfiles);
    const messages = createNetworkUpsertMessages(this.context.conversations, updatedProfiles);
    this.context.connectionManager.updateProfiles(updatedProfiles.map((profile) => profile.id));
    this.context.publish(messages);
    return { network, serverBuffer, messages };
  }

  deleteNetwork(networkId: string) {
    return this.deleteNetworkResult(networkId).deletedNetworkIds;
  }

  deleteNetworkResult(networkId: string) {
    const deletedNetworkIds = listRelatedNetworkIds(this.context.networks, networkId);
    if (deletedNetworkIds.length === 0) {
      throw notFound('Network not found');
    }
    const messages = this.context.connectionManager.removeNetworks(deletedNetworkIds);
    this.context.networks.delete(networkId);
    messages.push(...createNetworkRemoveMessages(deletedNetworkIds));
    this.context.publish(messages);
    return { deletedNetworkIds, messages };
  }
}
