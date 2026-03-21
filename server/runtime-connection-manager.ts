import { randomUUID } from 'node:crypto';
import type WebSocket from 'ws';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { FriendState, NetworkProfile, NetworkRuntimeState, ServerMessage } from '../shared/protocol.js';
import { IrcConnection } from './irc.js';
import { ChannelListSubscriptions } from './runtime-channel-lists.js';
import type { RuntimeEvent } from './irc-types.js';
import type { Storage } from './storage.js';

type RuntimeConnectionManagerOptions = {
  store: Storage;
  publish(messages: ServerMessage[]): void;
  sendSocket(ws: WebSocket, message: ServerMessage): void;
  onRuntimeEvent(event: RuntimeEvent): ServerMessage[];
  isClosing(): boolean;
};

export class RuntimeConnectionManager {
  private readonly store: Storage;
  private readonly publish: RuntimeConnectionManagerOptions['publish'];
  private readonly sendSocket: RuntimeConnectionManagerOptions['sendSocket'];
  private readonly onRuntimeEvent: RuntimeConnectionManagerOptions['onRuntimeEvent'];
  private readonly isClosing: RuntimeConnectionManagerOptions['isClosing'];
  private readonly channelLists: ChannelListSubscriptions;
  readonly connections = new Map<string, IrcConnection>();
  private readonly friendPresenceByNetwork = new Map<string, Set<string>>();
  private readonly friendPresenceCache = new Map<string, boolean>();

  constructor(options: RuntimeConnectionManagerOptions) {
    this.store = options.store;
    this.publish = options.publish;
    this.sendSocket = options.sendSocket;
    this.onRuntimeEvent = options.onRuntimeEvent;
    this.isClosing = options.isClosing;
    this.channelLists = new ChannelListSubscriptions((ws, message) => this.sendSocket(ws, message));
  }

  close() {
    this.channelLists.clearAll();
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
    this.friendPresenceByNetwork.clear();
  }

  removeSocket(ws: WebSocket) {
    this.channelLists.removeSocket(ws);
  }

  snapshot(networks: NetworkProfile[], friends: FriendState[]) {
    return {
      pendingChannels: Array.from(this.connections.values()).flatMap((connection) => connection.listPendingChannels()),
      friendPresence: this.computeFriendPresence(friends),
      networkStates: Object.fromEntries(
        networks.map((network) => {
          const connection = this.connections.get(network.id);
          return [network.id, toNetworkRuntimeState(connection, network.nick)];
        })
      ),
    };
  }

  getConnection(networkId: string) {
    const profile = this.getRequiredRuntimeNetwork(networkId);
    let connection = this.connections.get(networkId);
    if (!connection) {
      connection = new IrcConnection(profile, {
        onEvent: (event) => this.handleConnectionEvent(event),
      });
      connection.setFriendNicks(this.store.listFriends().map((friend) => friend.nick));
      this.connections.set(networkId, connection);
    }
    return connection;
  }

  disconnect(networkId: string) {
    this.connections.get(networkId)?.disconnect();
    this.channelLists.clearNetwork(networkId);
  }

  requestChannelList(networkId: string, requester?: WebSocket) {
    return this.channelLists.request(networkId, this.getConnection(networkId), randomUUID(), requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.channelLists.cancel(networkId, requester);
  }

  updateProfiles(networkIds: string[]) {
    for (const networkId of networkIds) {
      const runtimeProfile = this.store.getRuntimeNetwork(networkId);
      if (runtimeProfile) {
        this.connections.get(networkId)?.updateProfile(runtimeProfile);
      }
    }
  }

  removeNetworks(networkIds: string[]) {
    for (const networkId of networkIds) {
      this.connections.get(networkId)?.disconnect();
      this.connections.delete(networkId);
      this.channelLists.clearNetwork(networkId);
      this.friendPresenceByNetwork.delete(networkId);
    }
    return this.collectFriendPresenceDiffs();
  }

  syncFriendTracking() {
    const friendNicks = this.store.listFriends().map((friend) => friend.nick);
    for (const connection of this.connections.values()) {
      connection.setFriendNicks(friendNicks);
    }
  }

  deleteFriendPresenceCache(friendId: string) {
    this.friendPresenceCache.delete(friendId);
  }

  collectFriendPresenceDiffs() {
    const friends = this.store.listFriends();
    const nextPresence = this.computeFriendPresence(friends);
    const messages: ServerMessage[] = [];
    for (const friend of friends) {
      const online = nextPresence[friend.id] ?? false;
      if (this.friendPresenceCache.get(friend.id) === online) {
        continue;
      }
      this.friendPresenceCache.set(friend.id, online);
      messages.push({ type: 'friend.presence', friendId: friend.id, online });
    }
    for (const friendId of Array.from(this.friendPresenceCache.keys())) {
      if (friendId in nextPresence) {
        continue;
      }
      this.friendPresenceCache.delete(friendId);
    }
    return messages;
  }

  private handleConnectionEvent(event: RuntimeEvent) {
    if (this.isClosing()) {
      return;
    }

    if (event.type === 'friend-presence') {
      this.friendPresenceByNetwork.set(
        event.networkId,
        new Set(event.onlineNicks.map(normalizeIrcIdentifier))
      );
      this.publish(this.collectFriendPresenceDiffs());
      return;
    }

    if (event.type === 'state' && event.phase === 'offline') {
      this.channelLists.clearNetwork(event.networkId);
      if (this.friendPresenceByNetwork.delete(event.networkId)) {
        this.publish(this.collectFriendPresenceDiffs());
      }
    }

    if (
      event.type === 'channel-list-entry'
      || event.type === 'channel-list-completed'
      || event.type === 'channel-list-failed'
    ) {
      this.channelLists.handleEvent(event);
      return;
    }

    this.publish(this.onRuntimeEvent(event));
  }

  private computeFriendPresence(friends: FriendState[]) {
    return Object.fromEntries(friends.map((friend) => [friend.id, this.isFriendOnline(friend.nick)]));
  }

  private isFriendOnline(nick: string) {
    const normalized = normalizeIrcIdentifier(nick);
    for (const onlineNicks of this.friendPresenceByNetwork.values()) {
      if (onlineNicks.has(normalized)) {
        return true;
      }
    }
    return false;
  }

  private getRequiredRuntimeNetwork(networkId: string) {
    const profile = this.store.getRuntimeNetwork(networkId);
    if (!profile) {
      throw new Error('Network not found');
    }
    return profile;
  }
}

const toNetworkRuntimeState = (connection: IrcConnection | undefined, fallbackNick: string): NetworkRuntimeState =>
  connection
    ? {
        phase: connection.connected ? 'connected' : connection.socket ? 'connecting' : 'offline',
        serverName: connection.serverName,
        nick: connection.currentNick,
      }
    : {
        phase: 'offline',
        serverName: null,
        nick: fallbackNick,
      };
