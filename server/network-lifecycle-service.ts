import { isConnectionInstance, listConnectionPeers } from '../shared/network-model.js';
import type { BufferState, ServerMessage } from '../shared/protocol.js';
import { collectRequestedServerBuffer, createNetworkRemoveMessages, createNetworkUpsertMessages } from './network-lifecycle-messages.js';
import { badRequest, notFound } from './app-error.js';
import { createDuplicateNetworkName } from './network-name-utils.js';
import { parseNetworkInput } from './network-input.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import { requireRuntimeNetwork, requireStoredNetwork } from './runtime-network-guard.js';
import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';
import type { ConnectionInstanceProfile, StoredNetworkProfile } from '../shared/network-model.js';
import type { NetworkInput } from './storage-types.js';

type NetworkLifecycleContext = {
  connectionManager: RuntimeConnectionManager;
  conversations: Pick<RuntimeConversationStore, 'getServerBuffer' | 'listChannels'>;
  networks: Pick<
    RuntimeNetworkStore,
    'list' | 'get' | 'getRuntime' | 'upsert' | 'setConnectionClosed' | 'saveWithRelatedInstances' | 'deleteWithRelated'
  >;
};

type ConnectionInstanceResolution = {
  network: ConnectionInstanceProfile;
  alreadyConnecting: boolean;
};

type ConnectionOpenResult = {
  network: ConnectionInstanceProfile;
  serverBuffer: BufferState | null;
  messages: ServerMessage[];
  shouldConnect: boolean;
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
    const network = requireStoredNetwork(this.context.networks, networkId);
    if (isConnectionInstance(network)) {
      throw badRequest('Only saved networks can be removed');
    }
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

  openConnection(networkId: string): ConnectionOpenResult {
    const requested = requireStoredNetwork(this.context.networks, networkId);
    const resolved = this.resolveConnectionInstance(requested);
    const serverBuffer = this.context.conversations.getServerBuffer(resolved.network.id);
    const messages = createNetworkUpsertMessages(this.context.conversations, [resolved.network]);
    return { network: resolved.network, serverBuffer, messages, shouldConnect: !resolved.alreadyConnecting };
  }

  closeConnection(networkId: string) {
    const network = requireStoredNetwork(this.context.networks, networkId);
    if (!isConnectionInstance(network)) {
      throw badRequest('Only connection instances can be closed');
    }
    const messages = this.context.connectionManager.removeNetworks([network.id]);
    const closed = this.context.networks.setConnectionClosed(network.id, true);
    if (!closed) {
      throw notFound('Network not found');
    }
    messages.push({ type: 'network.upsert', network: closed });
    return { network: closed, messages };
  }

  private applyMutation(updatedProfileIds: readonly string[]) {
    this.context.connectionManager.updateProfiles([...updatedProfileIds]);
  }

  private resolveConnectionInstance(network: StoredNetworkProfile): ConnectionInstanceResolution {
    if (isConnectionInstance(network)) {
      return this.resolveExistingConnectionInstance(network);
    }

    const peers = listConnectionPeers(this.context.networks.list(), network.id);
    const connectedOrConnectingPeer = peers.find((peer) => {
      if (peer.connectionClosed === true) {
        return false;
      }
      const phase = this.context.connectionManager.getConnectionState(peer.id)?.phase;
      return phase === 'connected' || phase === 'connecting';
    });
    if (connectedOrConnectingPeer) {
      return { network: connectedOrConnectingPeer, alreadyConnecting: true };
    }

    const openPeer = peers.find((peer) => peer.connectionClosed !== true);
    if (openPeer) {
      return { network: openPeer, alreadyConnecting: false };
    }

    const closedPeer = peers.find((peer) => peer.connectionClosed === true);
    if (closedPeer) {
      return this.resolveExistingConnectionInstance(closedPeer);
    }

    return {
      network: this.createConnectionInstance(network),
      alreadyConnecting: false,
    };
  }

  private resolveExistingConnectionInstance(network: ConnectionInstanceProfile): ConnectionInstanceResolution {
    const phase = this.context.connectionManager.getConnectionState(network.id)?.phase;
    if (phase === 'connected' || phase === 'connecting') {
      return { network, alreadyConnecting: true };
    }
    if (network.connectionClosed !== true) {
      return { network, alreadyConnecting: false };
    }
    const reopened = this.context.networks.setConnectionClosed(network.id, false);
    if (!reopened || !isConnectionInstance(reopened)) {
      throw notFound('Network not found');
    }
    return { network: reopened, alreadyConnecting: false };
  }

  private createConnectionInstance(network: StoredNetworkProfile): ConnectionInstanceProfile {
    const created = this.context.networks.upsert(createConnectionInstanceInput(network));
    if (!isConnectionInstance(created)) {
      throw new Error('Expected connection instance');
    }
    return created;
  }
}

const createConnectionInstanceInput = (network: StoredNetworkProfile): NetworkInput => ({
  templateId: network.id,
  managerHidden: true,
  connectionClosed: false,
  name: network.name,
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
  favorite: network.favorite,
  autoJoin: network.autoJoin,
});
