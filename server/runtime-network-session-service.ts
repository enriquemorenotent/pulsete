import type WebSocket from 'ws';
import { notFound } from './app-error.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';

type RuntimeNetworkSessionServiceOptions = {
  connectionManager: RuntimeConnectionManager;
  networks: StorageNetworksRepository;
};

export class RuntimeNetworkSessionService {
  constructor(private readonly options: RuntimeNetworkSessionServiceOptions) {}

  connect(networkId: string) {
    this.requireNetwork(networkId);
    this.options.connectionManager.connect(networkId);
  }

  disconnect(networkId: string) {
    this.requireNetwork(networkId);
    this.options.connectionManager.disconnect(networkId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    this.requireNetwork(networkId);
    return this.options.connectionManager.requestChannelList(networkId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.options.connectionManager.cancelChannelList(networkId, requester);
  }

  private requireNetwork(networkId: string) {
    if (!this.options.networks.get(networkId)) {
      throw notFound('Network not found');
    }
  }
}
