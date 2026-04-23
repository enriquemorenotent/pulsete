import type WebSocket from 'ws';
import { isConnectionInstance } from '../shared/network-model.js';
import type { ServerMessage } from '../shared/protocol.js';
import { requireStoredNetwork } from './runtime-network-guard.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';
import type { RuntimeNetworkStore } from './runtime-store-ports.js';

type RuntimeNetworkSessionServiceOptions = {
  connectionManager: RuntimeConnectionManager;
  conversations: Pick<RuntimeConversationStore, 'getServerBuffer' | 'listChannels'>;
  networks: Pick<RuntimeNetworkStore, 'get' | 'setConnectionClosed'>;
};

export class RuntimeNetworkSessionService {
  constructor(private readonly options: RuntimeNetworkSessionServiceOptions) {}

  connect(networkId: string) {
    const network = requireStoredNetwork(this.options.networks, networkId);
    const messages: ServerMessage[] = [];
    if (isConnectionInstance(network) && network.connectionClosed === true) {
      const reopened = this.options.networks.setConnectionClosed(network.id, false);
      if (reopened) {
        const serverBuffer = this.options.conversations.getServerBuffer(network.id);
        if (serverBuffer) {
          messages.push({ type: 'buffer.upsert', buffer: serverBuffer });
        }
        messages.push({ type: 'network.upsert', network: reopened });
      }
    }
    this.options.connectionManager.connect(
      networkId,
      this.options.conversations.listChannels(networkId).map((channel) => channel.name)
    );
    return { messages };
  }

  disconnect(networkId: string) {
    requireStoredNetwork(this.options.networks, networkId);
    this.options.connectionManager.disconnect(networkId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    requireStoredNetwork(this.options.networks, networkId);
    return this.options.connectionManager.requestChannelList(networkId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.options.connectionManager.cancelChannelList(networkId, requester);
  }
}
