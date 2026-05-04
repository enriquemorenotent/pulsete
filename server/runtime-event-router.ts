import type { FriendState, NetworkProfile } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type WebSocket from 'ws';
import type { IrcConnection } from './irc.js';
import type { RuntimeEvent, IrcRuntimeChannelListConnection } from './irc-types.js';
import { translateRuntimeEvent } from './runtime-events.js';
import { RuntimeChannelListService } from './runtime-channel-lists.js';
import type { RuntimeConversationService } from './runtime-conversation-service.js';
import { RuntimeFriendPresenceProjector } from './runtime-friend-presence-projector.js';
import { createRuntimeProjectionSnapshot } from './runtime-snapshot-projector.js';
import type { RuntimeConversationStore, RuntimeFriendStore } from './runtime-store-ports.js';

type RuntimeEventRouterOptions = {
  conversations: RuntimeConversationService;
  buffers: Pick<RuntimeConversationStore, 'listBuffers' | 'listQueryNickAliases'>;
  friends: Pick<RuntimeFriendStore, 'list'>;
  publish(messages: ServerMessage[]): void;
  sendSocket(ws: WebSocket, message: ServerMessage): void;
};

export class RuntimeEventRouter {
  private readonly channelLists: RuntimeChannelListService;
  private readonly friendPresence = new RuntimeFriendPresenceProjector();

  constructor(private readonly options: RuntimeEventRouterOptions) {
    this.channelLists = new RuntimeChannelListService((ws, message) => this.options.sendSocket(ws, message));
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

  requestChannelList(networkId: string, connection: IrcRuntimeChannelListConnection, requestId: string, requester?: WebSocket) {
    return this.channelLists.request(networkId, connection, requestId, requester);
  }

  cancelChannelList(networkId: string, requester: WebSocket) {
    this.channelLists.cancel(networkId, requester);
  }

  snapshot(networks: NetworkProfile[], friends: FriendState[], connections: readonly IrcConnection[]) {
    return createRuntimeProjectionSnapshot(
      networks,
      friends,
      this.options.buffers.listBuffers(),
      connections,
      this.friendPresence,
    );
  }

  removeNetworks(networkIds: readonly string[]) {
    for (const networkId of networkIds) {
      this.channelLists.clearNetwork(networkId);
    }
    return this.friendPresence.removeNetworks(
      networkIds,
      this.options.friends.list(),
      this.options.buffers.listBuffers(),
    );
  }

  deleteFriendPresenceCache(friendId: string) {
    this.friendPresence.deleteFriendPresenceCache(friendId);
  }

  collectFriendPresenceDiffs() {
    return this.friendPresence.collectDiffs(
      this.options.friends.list(),
      this.options.buffers.listBuffers(),
    );
  }

  route(event: RuntimeEvent): ServerMessage[] {
    const routedMessages: ServerMessage[] = [];
    if (event.type === 'friend-presence') {
      const inferredNickMessages = this.createKnownAliasNickChangeMessages(event);
      return this.publishAndCollect(
        routedMessages,
        [
          ...inferredNickMessages,
          ...this.friendPresence.project(event, this.options.friends.list(), this.options.buffers.listBuffers()),
        ],
      );
    }

    if (event.type === 'state' && event.phase === 'offline') {
      this.channelLists.clearNetwork(event.networkId);
      this.publishAndCollect(
        routedMessages,
        this.friendPresence.clearNetwork(
          event.networkId,
          this.options.friends.list(),
          this.options.buffers.listBuffers(),
        ),
      );
    }

    if (
      event.type === 'channel-list-entry'
      || event.type === 'channel-list-completed'
      || event.type === 'channel-list-failed'
    ) {
      this.channelLists.handle(event);
      return routedMessages;
    }

    return this.publishAndCollect(
      routedMessages,
      translateRuntimeEvent(event, this.options.conversations),
    );
  }

  private publishAndCollect(
    routedMessages: ServerMessage[],
    messages: ServerMessage[],
  ) {
    routedMessages.push(...messages);
    this.publish(messages);
    return routedMessages;
  }

  private publish(messages: ServerMessage[]) {
    if (messages.length > 0) {
      this.options.publish(messages);
    }
  }

  private createKnownAliasNickChangeMessages(event: Extract<RuntimeEvent, { type: 'friend-presence' }>) {
    const presences = new Map(
      Object.entries(event.presences).map(([nick, presence]) => [normalizeIrcIdentifier(nick), presence]),
    );
    const aliasesByBufferId = new Map<string, string[]>();
    for (const alias of this.options.buffers.listQueryNickAliases(event.networkId)) {
      aliasesByBufferId.set(alias.bufferId, [...(aliasesByBufferId.get(alias.bufferId) ?? []), alias.nick]);
    }

    const messages: ServerMessage[] = [];
    for (const buffer of this.options.buffers.listBuffers(event.networkId)) {
      if (buffer.kind !== 'query' || presences.get(normalizeIrcIdentifier(buffer.target)) !== 'offline') {
        continue;
      }
      const onlineAliases = (aliasesByBufferId.get(buffer.id) ?? [])
        .filter((nick) => normalizeIrcIdentifier(nick) !== normalizeIrcIdentifier(buffer.target))
        .filter((nick) => presences.get(normalizeIrcIdentifier(nick)) === 'online');
      const uniqueOnlineAliases = [...new Map(
        onlineAliases.map((nick) => [normalizeIrcIdentifier(nick), nick] as const),
      ).values()];
      if (uniqueOnlineAliases.length !== 1) {
        continue;
      }
      messages.push(...this.options.conversations.handlePeerNickEvent({
        type: 'peer-nick',
        networkId: event.networkId,
        oldNick: buffer.target,
        newNick: uniqueOnlineAliases[0]!,
        self: false,
      }));
    }
    return messages;
  }
}
