import { isConnectionInstance } from '../shared/network-model.js';
import type { ServerMessage } from '../shared/protocol.js';
import { collectRequestedServerBuffer, createNetworkRemoveMessages, createNetworkUpsertMessages } from './network-lifecycle-messages.js';
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
};

export class NetworkLifecycleService {
  constructor(private readonly context: NetworkLifecycleContext) {}

  duplicateNetwork(networkId: string) {
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
    return { network: duplicate, serverBuffer: null, messages };
  }

  saveNetwork(data: unknown, networkId?: string) {
    const input = parseNetworkInput(data, networkId);
    if (networkId && !this.context.networks.get(networkId)) {
      throw notFound('Network not found');
    }
    const updatedProfiles = this.context.networks.saveWithRelatedInstances(input);
    const network = updatedProfiles[0] ?? null;
    if (!network) {
      throw notFound('Network not found');
    }
    const serverBuffer = collectRequestedServerBuffer(this.context.conversations, network.id, updatedProfiles);
    const messages = createNetworkUpsertMessages(this.context.conversations, updatedProfiles);
    this.applyMutation(updatedProfiles.map((profile) => profile.id), messages);
    return { network, serverBuffer, messages };
  }

  deleteNetwork(networkId: string) {
    const deletedNetworkIds = this.context.networks.deleteWithRelated(networkId);
    if (deletedNetworkIds.length === 0) {
      throw notFound('Network not found');
    }
    const messages = [
      ...this.context.connectionManager.removeNetworks(deletedNetworkIds),
      ...createNetworkRemoveMessages(deletedNetworkIds),
    ];
    return { deletedNetworkIds, messages };
  }

  private applyMutation(updatedProfileIds: readonly string[], messages: ServerMessage[]) {
    this.context.connectionManager.updateProfiles([...updatedProfileIds]);
  }
}
