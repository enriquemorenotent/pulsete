import type WebSocket from 'ws';
import type {
  BufferState,
  ClientMessage,
  NetworkProfile,
  ServerMessage,
} from '../shared/protocol.js';
import type { NetworkLifecycleService } from './network-lifecycle-service.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeConversationService } from './runtime-conversation-service.js';
import type { RuntimeFriendService } from './runtime-friend-service.js';
import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeMutedNickService } from './runtime-muted-nick-service.js';
import type { RuntimeNickEmojiService } from './runtime-nick-emoji-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type { createRuntimeSnapshot } from './runtime-snapshot.js';
import type { RuntimeNetworkCatalog } from './runtime-store-ports.js';

export type { RuntimeNetworkCatalog, RuntimeStore } from './runtime-store-ports.js';

export type RuntimeGateway = {
  attachSocket(ws: WebSocket): void;
  detachSocket(ws: WebSocket): void;
  publish(message: ServerMessage | readonly ServerMessage[]): void;
  snapshot(): ReturnType<typeof createRuntimeSnapshot>;
  close(): void;
};

export type RuntimeConversationMutations = {
  openQuery(
    networkId: string,
    target: string,
  ): { buffer: BufferState; messages: readonly ServerMessage[] };
  closeBuffer(bufferId: string): { buffer: BufferState; messages: readonly ServerMessage[] };
  markBufferRead: RuntimeConversationService['markBufferRead'];
  saveBufferNotes: RuntimeConversationService['saveBufferNotes'];
  history: RuntimeConversationService['listBufferHistory'];
  searchHistory: RuntimeConversationService['searchBufferHistory'];
  exportHistory(bufferId: string): ReturnType<RuntimeConversationService['exportBufferHistory']>;
};

export type RuntimeFriendMutations = {
  upsertFriend: RuntimeFriendService['upsertFriend'];
  removeFriend: RuntimeFriendService['removeFriend'];
};

export type RuntimeMutedNickMutations = {
  upsertMutedNick: RuntimeMutedNickService['upsertMutedNick'];
  removeMutedNick: RuntimeMutedNickService['removeMutedNick'];
};

export type RuntimeNickEmojiMutations = {
  saveNickEmoji: RuntimeNickEmojiService['saveNickEmoji'];
};

export type RuntimeNetworkMutations = {
  saveNetwork: NetworkLifecycleService['saveNetwork'];
  duplicateNetwork: NetworkLifecycleService['duplicateNetwork'];
  deleteNetwork: NetworkLifecycleService['deleteNetwork'];
  connectNetwork(networkId: string): { network: NetworkProfile; serverBuffer: BufferState | null; messages: readonly ServerMessage[] };
  closeConnection: NetworkLifecycleService['closeConnection'];
};

export type RuntimeHttpApi = {
  networks: {
    list: RuntimeNetworkCatalog['list'];
    save: RuntimeNetworkMutations['saveNetwork'];
    duplicate: RuntimeNetworkMutations['duplicateNetwork'];
    remove: RuntimeNetworkMutations['deleteNetwork'];
    close: RuntimeNetworkMutations['closeConnection'];
    connect: RuntimeNetworkMutations['connectNetwork'];
    disconnect(networkId: string): void;
  };
  buffers: {
    joinChannel(networkId: string, channel: string, sourceBufferId?: string): void;
    openQuery: RuntimeConversationMutations['openQuery'];
    close: RuntimeConversationMutations['closeBuffer'];
    markRead: RuntimeConversationMutations['markBufferRead'];
    saveNotes: RuntimeConversationMutations['saveBufferNotes'];
    history: RuntimeConversationMutations['history'];
    searchHistory: RuntimeConversationMutations['searchHistory'];
    exportHistory: RuntimeConversationMutations['exportHistory'];
  };
  friends: {
    add: RuntimeFriendMutations['upsertFriend'];
    remove: RuntimeFriendMutations['removeFriend'];
  };
  nickEmojis: {
    save: RuntimeNickEmojiMutations['saveNickEmoji'];
  };
  mutedNicks: {
    add: RuntimeMutedNickMutations['upsertMutedNick'];
    remove: RuntimeMutedNickMutations['removeMutedNick'];
  };
};

export type RuntimeWebSocketApi = {
  attachSocket(ws: WebSocket): void;
  detachSocket(ws: WebSocket): void;
  snapshot(): ReturnType<typeof createRuntimeSnapshot>;
  handleMessage(ws: WebSocket, message: ClientMessage): void;
};

export type RuntimeServices = {
  connections: RuntimeConnectionManager['connections'];
  gateway: RuntimeGateway;
  sessions: RuntimeNetworkSessionService;
  conversations: RuntimeConversationMutations;
  friends: RuntimeFriendMutations;
  mutedNicks: RuntimeMutedNickMutations;
  nickEmojis: RuntimeNickEmojiMutations;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  http: RuntimeHttpApi;
  ws: RuntimeWebSocketApi;
};
