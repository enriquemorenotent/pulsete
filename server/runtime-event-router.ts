import type { FriendState, NetworkProfile, ServerMessage } from '../shared/protocol.js';
import type WebSocket from 'ws';
import type { IrcConnection } from './irc.js';
import type { RuntimeEvent } from './irc-types.js';
import { translateRuntimeEvent } from './runtime-events.js';
import { ChannelListDispatcher } from './runtime-channel-list-dispatcher.js';
import type { RuntimeConversationProjector } from './runtime-conversation-projector.js';
import { RuntimeFriendPresenceProjector } from './runtime-friend-presence-projector.js';
import { createRuntimeProjectionSnapshot } from './runtime-snapshot-projector.js';
import type { Storage } from './storage.js';

type RuntimeEventRouterOptions = {
  conversationProjector: RuntimeConversationProjector;
  publish(messages: ServerMessage[]): void;
  sendSocket(ws: WebSocket, message: ServerMessage): void;
  store: Storage;
};

export class RuntimeEventRouter {
  private readonly channelLists: ChannelListDispatcher;
  private readonly friendPresence = new RuntimeFriendPresenceProjector();

  constructor(private readonly options: RuntimeEventRouterOptions) {
    this.channelLists = new ChannelListDispatcher((ws, message) => this.options.sendSocket(ws, message));
  }

  clearAll() {
    this.channelLists.clearAll();
    this.friendPresence.clearAll();
  }

  clearNetwork(networkId: string) {
    this.channelLists.clearNetwork(networkId);
  }

  removeSocket(ws: WebSocket) {
    this.channelLists.removeSocket(ws);
  }

  requestChannelList(networkId: string, connection: IrcConnection, requestId: string, requester?: WebSocket) {
    return this.channelLists.request(networkId, connection, requestId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.channelLists.cancel(networkId, requester);
  }

  snapshot(networks: NetworkProfile[], friends: FriendState[], connections: readonly IrcConnection[]) {
    return createRuntimeProjectionSnapshot(networks, friends, connections, this.friendPresence);
  }

  removeNetworks(networkIds: readonly string[]) {
    for (const networkId of networkIds) {
      this.channelLists.clearNetwork(networkId);
    }
    return this.friendPresence.removeNetworks(networkIds, this.options.store.listFriends());
  }

  deleteFriendPresenceCache(friendId: string) {
    this.friendPresence.deleteFriendPresenceCache(friendId);
  }

  collectFriendPresenceDiffs() {
    return this.friendPresence.collectDiffs(this.options.store.listFriends());
  }

  route(event: RuntimeEvent) {
    if (event.type === 'friend-presence') {
      this.publish(this.friendPresence.project(event, this.options.store.listFriends()));
      return;
    }

    if (event.type === 'state' && event.phase === 'offline') {
      this.channelLists.clearNetwork(event.networkId);
      this.publish(this.friendPresence.clearNetwork(event.networkId, this.options.store.listFriends()));
    }

    if (
      event.type === 'channel-list-entry'
      || event.type === 'channel-list-completed'
      || event.type === 'channel-list-failed'
    ) {
      this.channelLists.handle(event);
      return;
    }

    this.publish(translateRuntimeEvent(event, this.options.conversationProjector));
  }

  private publish(messages: ServerMessage[]) {
    if (messages.length > 0) {
      this.options.publish(messages);
    }
  }
}
