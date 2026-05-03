import type { BufferState } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import type { StoredNetworkProfile } from '../shared/network-model.js';
import { createNetworkRemoveMessages, createNetworkUpsertMessages } from './network-lifecycle-messages.js';
import { notFound } from './app-error.js';
import { createDuplicateNetworkName } from './network-name-utils.js';
import { parseNetworkInput } from './network-input.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { requireRuntimeNetwork, requireStoredNetwork } from './runtime-network-guard.js';
import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';

type NetworkLifecycleContext = {
  connectionManager: RuntimeConnectionManager;
  conversations: Pick<RuntimeConversationStore, 'getServerBuffer'>;
  networks: Pick<RuntimeNetworkStore, 'list' | 'get' | 'getRuntime' | 'upsert' | 'delete' | 'setWorkspaceOpen'>;
};

type ConnectionOpenResult = {
  network: StoredNetworkProfile;
  serverBuffer: BufferState | null;
  messages: ServerMessage[];
  shouldConnect: boolean;
};

export class NetworkLifecycleService {
  constructor(private readonly context: NetworkLifecycleContext) {}

  duplicateNetwork(networkId: string) {
    const network = requireStoredNetwork(this.context.networks, networkId);
    const runtimeProfile = requireRuntimeNetwork(this.context.networks, networkId);
    const duplicate = this.context.networks.upsert({
      workspaceOpen: false,
      name: createDuplicateNetworkName(network.name, this.context.networks.list()),
      host: network.host,
      port: network.port,
      tls: network.tls,
      nick: network.nick,
      altNicks: network.altNicks,
      historicalSelfNicks: network.historicalSelfNicks ?? [],
      username: network.username,
      realName: network.realName,
      authMethod: network.authMethod,
      authTarget: network.authTarget,
      authAccount: network.authAccount,
      password: runtimeProfile.password,
      favorite: network.favorite,
      autoJoin: network.autoJoin,
      notes: network.notes ?? '',
    });
    const messages = [{ type: 'network.upsert', network: duplicate } satisfies ServerMessage];
    return { network: duplicate, serverBuffer: null, messages };
  }

  saveNetwork(data: unknown, networkId?: string) {
    const input = parseNetworkInput(data, networkId);
    if (networkId) {
      requireStoredNetwork(this.context.networks, networkId);
    }
    const network = this.context.networks.upsert(input);
    const messages = createNetworkUpsertMessages(this.context.conversations, [network]);
    this.context.connectionManager.updateProfiles([network.id]);
    return { network, serverBuffer: this.context.conversations.getServerBuffer(network.id), messages };
  }

  deleteNetwork(networkId: string) {
    requireStoredNetwork(this.context.networks, networkId);
    const deletedNetworkIds = this.context.networks.delete(networkId);
    if (deletedNetworkIds.length === 0) {
      throw notFound('Network not found');
    }
    const messages = [
      ...this.context.connectionManager.removeNetworks(deletedNetworkIds),
      ...createNetworkRemoveMessages(deletedNetworkIds),
    ];
    return { deletedNetworkIds, messages };
  }

  openConnection(networkId: string): ConnectionOpenResult {
    const requested = requireStoredNetwork(this.context.networks, networkId);
    const phase = this.context.connectionManager.getConnectionState(requested.id)?.phase;
    const alreadyConnecting = phase === 'connected' || phase === 'connecting';
    const network = requested.workspaceOpen
      ? requested
      : this.context.networks.setWorkspaceOpen(requested.id, true);
    if (!network) {
      throw notFound('Network not found');
    }
    const serverBuffer = this.context.conversations.getServerBuffer(network.id);
    const messages = createNetworkUpsertMessages(this.context.conversations, [network]);
    return { network, serverBuffer, messages, shouldConnect: !alreadyConnecting };
  }

  closeConnection(networkId: string) {
    const network = requireStoredNetwork(this.context.networks, networkId);
    const messages = this.context.connectionManager.removeNetworks([network.id]);
    const closed = this.context.networks.setWorkspaceOpen(network.id, false);
    if (!closed) {
      throw notFound('Network not found');
    }
    messages.push({ type: 'network.upsert', network: closed });
    return { network: closed, messages };
  }
}
