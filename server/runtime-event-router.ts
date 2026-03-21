import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { FriendState, NetworkProfile, NetworkRuntimeState, ServerMessage } from '../shared/protocol.js';
import type WebSocket from 'ws';
import type { IrcConnection } from './irc.js';
import type { RuntimeEvent } from './irc-types.js';
import { translateRuntimeEvent } from './runtime-events.js';
import { ChannelListSubscriptions } from './runtime-channel-lists.js';
import type { RuntimeConversations } from './runtime-conversations.js';
import type { Storage } from './storage.js';

type RuntimeEventRouterOptions = {
  conversations: RuntimeConversations;
  publish(messages: ServerMessage[]): void;
  sendSocket(ws: WebSocket, message: ServerMessage): void;
  store: Storage;
};

export class RuntimeEventRouter {
  private readonly channelLists: ChannelListSubscriptions;
  private readonly friendPresenceByNetwork = new Map<string, Set<string>>();
  private readonly friendPresenceCache = new Map<string, boolean>();

  constructor(private readonly options: RuntimeEventRouterOptions) {
    this.channelLists = new ChannelListSubscriptions((ws, message) => this.options.sendSocket(ws, message));
  }

  clearAll() {
    this.channelLists.clearAll();
    this.friendPresenceByNetwork.clear();
    this.friendPresenceCache.clear();
  }

  clearNetwork(networkId: string) {
    this.channelLists.clearNetwork(networkId);
  }

  removeSocket(ws: WebSocket) {
    this.channelLists.removeSocket(ws);
  }

  requestChannelList(networkId: string, connection: IrcConnection, requestId: string, requester?: WebSocket) {
    return this.channelLists.request(networkId, connection.runtimeSession.channelList, requestId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.channelLists.cancel(networkId, requester);
  }

  snapshot(networks: NetworkProfile[], friends: FriendState[], connections: readonly IrcConnection[]) {
    return {
      pendingChannels: connections.flatMap((connection) => connection.runtimeSession.channels.listPendingChannels()),
      friendPresence: this.computeFriendPresence(friends),
      networkStates: Object.fromEntries(
        networks.map((network) => {
          const connection = connections.find((candidate) => candidate.profile.id === network.id);
          return [network.id, toNetworkRuntimeState(connection, network.nick)];
        })
      ),
    };
  }

  removeNetworks(networkIds: readonly string[]) {
    for (const networkId of networkIds) {
      this.channelLists.clearNetwork(networkId);
      this.friendPresenceByNetwork.delete(networkId);
    }
    return this.collectFriendPresenceDiffs();
  }

  deleteFriendPresenceCache(friendId: string) {
    this.friendPresenceCache.delete(friendId);
  }

  collectFriendPresenceDiffs() {
    const friends = this.options.store.listFriends();
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

  route(event: RuntimeEvent) {
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

    this.publish(translateRuntimeEvent(event, this.options.conversations));
  }

  private publish(messages: ServerMessage[]) {
    if (messages.length > 0) {
      this.options.publish(messages);
    }
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
}

const toNetworkRuntimeState = (
  connection: IrcConnection | undefined,
  fallbackNick: string
): NetworkRuntimeState =>
  connection
    ? connection.runtimeSession.lifecycle.state
    : {
        phase: 'offline',
        serverName: null,
        nick: fallbackNick,
      };
