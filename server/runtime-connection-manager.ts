import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import type { BufferState, FriendState, NetworkProfile } from '../shared/protocol.js';
import { IrcConnection } from './irc.js';
import type { RuntimeEvent } from './irc-types.js';
import { requireRuntimeNetwork } from './runtime-network-guard.js';
import { RuntimeEventRouter } from './runtime-event-router.js';
import type {
  RuntimeConversationStore,
  RuntimeFriendStore,
  RuntimeNetworkStore,
} from './runtime-store-ports.js';

type RuntimeConnectionManagerOptions = {
  eventRouter: RuntimeEventRouter;
  onConnectionEvent?(event: RuntimeEvent): void;
  conversations: Pick<RuntimeConversationStore, 'listBuffers'>;
  friends: Pick<RuntimeFriendStore, 'list'>;
  networks: Pick<RuntimeNetworkStore, 'getRuntime'>;
  isClosing(): boolean;
};

export class RuntimeConnectionManager {
  private readonly conversations: RuntimeConnectionManagerOptions['conversations'];
  private readonly friends: Pick<RuntimeFriendStore, 'list'>;
  private readonly eventRouter: RuntimeEventRouter;
  private readonly networks: Pick<RuntimeNetworkStore, 'getRuntime'>;
  private readonly onConnectionEvent: RuntimeConnectionManagerOptions['onConnectionEvent'];
  private readonly isClosing: RuntimeConnectionManagerOptions['isClosing'];
  readonly connections = new Map<string, IrcConnection>();

  constructor(options: RuntimeConnectionManagerOptions) {
    this.conversations = options.conversations;
    this.friends = options.friends;
    this.eventRouter = options.eventRouter;
    this.networks = options.networks;
    this.onConnectionEvent = options.onConnectionEvent;
    this.isClosing = options.isClosing;
  }

  close() {
    this.eventRouter.clearAll();
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
  }

  removeSocket(ws: WebSocket) {
    this.eventRouter.removeSocket(ws);
  }

  snapshot(networks: NetworkProfile[], friends: FriendState[]) {
    return this.eventRouter.snapshot(networks, friends, Array.from(this.connections.values()));
  }

  getConnection(networkId: string) {
    const profile = this.getRequiredRuntimeNetwork(networkId);
    let connection = this.connections.get(networkId);
    if (!connection) {
      connection = new IrcConnection(profile, {
        onEvent: (event) => this.handleConnectionEvent(event),
      });
      connection.setFriendNicks(this.listTrackedPresenceNicks(networkId));
      this.connections.set(networkId, connection);
    }
    return connection;
  }

  connect(networkId: string, reconnectChannels: string[] = []) {
    const connection = this.getConnection(networkId);
    connection.setReconnectChannels(reconnectChannels);
    connection.connect();
  }

  disconnect(networkId: string) {
    this.connections.get(networkId)?.disconnect();
    this.eventRouter.clearNetwork(networkId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    return this.eventRouter.requestChannelList(networkId, this.getConnection(networkId), randomUUID(), requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.eventRouter.cancelChannelList(networkId, requester);
  }

  updateProfiles(networkIds: string[]) {
    for (const networkId of networkIds) {
      const runtimeProfile = this.networks.getRuntime(networkId);
      if (runtimeProfile) {
        this.connections.get(networkId)?.updateProfile(runtimeProfile);
      }
    }
  }

  removeNetworks(networkIds: string[]) {
    for (const networkId of networkIds) {
      const connection = this.connections.get(networkId);
      if (connection) {
        this.disposeConnection(connection);
      }
      this.connections.delete(networkId);
    }
    return this.eventRouter.removeNetworks(networkIds);
  }

  syncPresenceTracking(networkId?: string) {
    const targetNetworkIds = networkId ? [networkId] : Array.from(this.connections.keys());
    for (const targetNetworkId of targetNetworkIds) {
      this.connections.get(targetNetworkId)?.setFriendNicks(this.listTrackedPresenceNicks(targetNetworkId));
    }
  }

  syncFriendTracking() {
    this.syncPresenceTracking();
  }

  deleteFriendPresenceCache(friendId: string) {
    this.eventRouter.deleteFriendPresenceCache(friendId);
  }

  collectFriendPresenceDiffs() {
    return this.eventRouter.collectFriendPresenceDiffs();
  }

  private listTrackedPresenceNicks(networkId: string) {
    return [
      ...this.friends.list().map((friend) => friend.nick),
      ...this.conversations
        .listBuffers(networkId)
        .filter((buffer): buffer is BufferState & { kind: 'query' } => buffer.kind === 'query')
        .map((buffer) => buffer.target),
    ];
  }

  private handleConnectionEvent(event: RuntimeEvent) {
    if (this.isClosing()) {
      return;
    }
    this.onConnectionEvent?.(event);
    this.eventRouter.route(event);
  }

  private getRequiredRuntimeNetwork(networkId: string) {
    return requireRuntimeNetwork(this.networks, networkId);
  }

  private disposeConnection(connection: IrcConnection) {
    connection.dispose();
  }
}
