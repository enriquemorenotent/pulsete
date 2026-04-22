import { isConnectionInstance } from '../shared/network-model.js';
import type { ServerMessage } from '../shared/protocol.js';
import { collectRequestedServerBuffer, createNetworkRemoveMessages, createNetworkUpsertMessages } from './network-lifecycle-messages.js';
import { badRequest, notFound } from './app-error.js';
import { createDuplicateNetworkName } from './network-name-utils.js';
import { parseNetworkInput } from './network-input.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { requireRuntimeNetwork, requireStoredNetwork } from './runtime-network-guard.js';
import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';

type NetworkLifecycleContext = {
  connectionManager: RuntimeConnectionManager;
  conversations: Pick<RuntimeConversationStore, 'getServerBuffer'>;
  networks: Pick<
    RuntimeNetworkStore,
    'list' | 'get' | 'getRuntime' | 'upsert' | 'saveWithRelatedInstances' | 'deleteWithRelated'
  >;
};

export class NetworkLifecycleService {
  constructor(private readonly context: NetworkLifecycleContext) {}

  duplicateNetwork(networkId: string) {
    const network = requireStoredNetwork(this.context.networks, networkId);
    if (isConnectionInstance(network)) {
      throw badRequest('Only saved networks can be duplicated');
    }
    const runtimeProfile = requireRuntimeNetwork(this.context.networks, networkId);
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
      authMethod: network.authMethod,
      authTarget: network.authTarget,
      authAccount: network.authAccount,
      password: runtimeProfile.password,
      favorite: network.favorite,
      autoJoin: network.autoJoin,
      personaNote: network.personaNote,
    });
    const messages = [{ type: 'network.upsert', network: duplicate } satisfies ServerMessage];
    return { network: duplicate, serverBuffer: null, messages };
  }

  saveNetwork(data: unknown, networkId?: string) {
    const input = parseNetworkInput(data, networkId);
    if (networkId) {
      requireStoredNetwork(this.context.networks, networkId);
    }
    const saveResult = this.context.networks.saveWithRelatedInstances(input);
    const updatedProfiles = [saveResult.requested, ...saveResult.relatedInstances];
    const serverBuffer = collectRequestedServerBuffer(this.context.conversations, saveResult.requested);
    const messages = createNetworkUpsertMessages(this.context.conversations, updatedProfiles);
    this.applyMutation(updatedProfiles.map((profile) => profile.id));
    return { network: saveResult.requested, serverBuffer, messages };
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

  private applyMutation(updatedProfileIds: readonly string[]) {
    this.context.connectionManager.updateProfiles([...updatedProfileIds]);
  }
}
