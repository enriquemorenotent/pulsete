import type WebSocket from 'ws';
import type {
  AssistantPreferences,
  AssistantTaskKind,
  AssistantThread,
  AssistantThreadSummary,
  AssistantTurnAttachmentInput,
  ClientMessage,
  ServerMessage,
} from '../shared/protocol.js';
import type { NetworkLifecycleService } from './network-lifecycle-service.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeConversationService } from './runtime-conversation-service.js';
import type { RuntimeFriendService } from './runtime-friend-service.js';
import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type { createRuntimeSnapshot } from './runtime-snapshot.js';
import type { RuntimeNetworkCatalog, RuntimeStore } from './runtime-store-ports.js';

export type { RuntimeNetworkCatalog, RuntimeStore } from './runtime-store-ports.js';

export type RuntimeGateway = {
  attachSocket(ws: WebSocket): void;
  detachSocket(ws: WebSocket): void;
  publish(message: ServerMessage | readonly ServerMessage[]): void;
  snapshot(): ReturnType<typeof createRuntimeSnapshot>;
  close(): void;
};

export type RuntimeConversationMutations = {
  openQuery: RuntimeConversationService['openQuery'];
  closeBuffer(bufferId: string): ReturnType<RuntimeConversationService['closeQueryBuffer']>;
  markBufferRead: RuntimeConversationService['markBufferRead'];
  history: RuntimeConversationService['listBufferHistory'];
  clearHistory(bufferId: string): ReturnType<RuntimeConversationService['clearBufferHistory']>;
};

export type RuntimeFriendMutations = {
  upsertFriend: RuntimeFriendService['upsertFriend'];
  removeFriend: RuntimeFriendService['removeFriend'];
};

export type RuntimeNetworkMutations = {
  saveNetwork: NetworkLifecycleService['saveNetwork'];
  duplicateNetwork: NetworkLifecycleService['duplicateNetwork'];
  deleteNetwork: NetworkLifecycleService['deleteNetwork'];
};

export type RuntimeAssistantApi = {
  startChatgptLogin(): Promise<{ loginId: string; authUrl: string }>;
  cancelLogin(loginId: string): Promise<void>;
  logout(): Promise<void>;
  createThread(input: {
    bufferId: string | null;
    task: AssistantTaskKind;
    model?: string;
  }): Promise<AssistantThreadSummary>;
  deleteThread(threadId: string): Promise<{ messages: readonly ServerMessage[] }>;
  readThread(threadId: string): Promise<AssistantThread>;
  startTurn(input: {
    threadId: string;
    prompt: string;
    attachments?: AssistantTurnAttachmentInput[];
  }): Promise<void>;
  importHistory(input: {
    threadId: string;
    prompt?: string;
    attachments: AssistantTurnAttachmentInput[];
  }): Promise<void>;
  interruptThread(threadId: string): Promise<void>;
  interruptTurn(threadId: string, turnId: string): Promise<void>;
  updatePreferences(input: {
    defaultModel?: string;
    activeThreadId?: string | null;
  }): AssistantPreferences;
};

export type RuntimeHttpApi = {
  networks: {
    list: RuntimeNetworkCatalog['list'];
    save: RuntimeNetworkMutations['saveNetwork'];
    duplicate: RuntimeNetworkMutations['duplicateNetwork'];
    remove: RuntimeNetworkMutations['deleteNetwork'];
    connect(networkId: string): void;
    disconnect(networkId: string): void;
  };
  buffers: {
    joinChannel(networkId: string, channel: string, sourceBufferId?: string): void;
    openQuery: RuntimeConversationMutations['openQuery'];
    close: RuntimeConversationMutations['closeBuffer'];
    markRead: RuntimeConversationMutations['markBufferRead'];
    history: RuntimeConversationMutations['history'];
    clearHistory: RuntimeConversationMutations['clearHistory'];
  };
  friends: {
    add: RuntimeFriendMutations['upsertFriend'];
    remove: RuntimeFriendMutations['removeFriend'];
  };
  assistant: RuntimeAssistantApi;
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
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  networks: RuntimeNetworkMutations;
  assistant: RuntimeAssistantApi;
  http: RuntimeHttpApi;
  ws: RuntimeWebSocketApi;
};
