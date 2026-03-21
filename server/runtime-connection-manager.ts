import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import type { FriendState, NetworkProfile } from '../shared/protocol.js';
import { IrcConnection } from './irc.js';
import type { RuntimeEvent } from './irc-types.js';
import { RuntimeEventRouter } from './runtime-event-router.js';
import type { Storage } from './storage.js';

type RuntimeConnectionManagerOptions = {
  eventRouter: RuntimeEventRouter;
  onConnectionEvent?(event: RuntimeEvent): void;
  store: Storage;
  isClosing(): boolean;
};

export class RuntimeConnectionManager {
  private readonly store: Storage;
  private readonly eventRouter: RuntimeEventRouter;
  private readonly onConnectionEvent: RuntimeConnectionManagerOptions['onConnectionEvent'];
  private readonly isClosing: RuntimeConnectionManagerOptions['isClosing'];
  readonly connections = new Map<string, IrcConnection>();

  constructor(options: RuntimeConnectionManagerOptions) {
    this.store = options.store;
    this.eventRouter = options.eventRouter;
    this.onConnectionEvent = options.onConnectionEvent;
    this.isClosing = options.isClosing;
  }

  close() {
    this.eventRouter.clearAll();
    for (const connection of this.connections.values()) {
      connection.runtimeSession.lifecycle.disconnect();
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
      connection.runtimeSession.friendPresence.setFriendNicks(this.store.listFriends().map((friend) => friend.nick));
      this.connections.set(networkId, connection);
    }
    return connection;
  }

  getSession(networkId: string) {
    return this.getConnection(networkId).runtimeSession;
  }

  connect(networkId: string) {
    this.getConnection(networkId).runtimeSession.lifecycle.connect();
  }

  disconnect(networkId: string) {
    this.connections.get(networkId)?.runtimeSession.lifecycle.disconnect();
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
      const runtimeProfile = this.store.getRuntimeNetwork(networkId);
      if (runtimeProfile) {
        this.connections.get(networkId)?.runtimeSession.lifecycle.updateProfile(runtimeProfile);
      }
    }
  }

  removeNetworks(networkIds: string[]) {
    for (const networkId of networkIds) {
      this.connections.get(networkId)?.runtimeSession.lifecycle.disconnect();
      this.connections.delete(networkId);
    }
    return this.eventRouter.removeNetworks(networkIds);
  }

  syncFriendTracking() {
    const friendNicks = this.store.listFriends().map((friend) => friend.nick);
    for (const connection of this.connections.values()) {
      connection.runtimeSession.friendPresence.setFriendNicks(friendNicks);
    }
  }

  deleteFriendPresenceCache(friendId: string) {
    this.eventRouter.deleteFriendPresenceCache(friendId);
  }

  collectFriendPresenceDiffs() {
    return this.eventRouter.collectFriendPresenceDiffs();
  }

  private handleConnectionEvent(event: RuntimeEvent) {
    if (this.isClosing()) {
      return;
    }
    this.onConnectionEvent?.(event);
    this.eventRouter.route(event);
  }

  private getRequiredRuntimeNetwork(networkId: string) {
    const profile = this.store.getRuntimeNetwork(networkId);
    if (!profile) {
      throw new Error('Network not found');
    }
    return profile;
  }
}
