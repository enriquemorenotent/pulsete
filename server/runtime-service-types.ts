import type WebSocket from 'ws';
import type { BufferState, NetworkProfile } from '../shared/protocol-chat.js';
import type { ClientMessage, ServerMessage } from '../shared/protocol-messages.js';
import type { NetworkLifecycleService } from './network-lifecycle-service.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeAiAssistantService } from './runtime-ai-assistant-service.js';
import type { RuntimeConversationService } from './runtime-conversation-service.js';
import type { RuntimeFriendService } from './runtime-friend-service.js';
import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeMutedNickService } from './runtime-muted-nick-service.js';
import type { RuntimeNickEmojiService } from './runtime-nick-emoji-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type { createRuntimeSnapshot } from './runtime-snapshot.js';
import type { RuntimeNetworkCatalog, RuntimeStore } from './runtime-store.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import type {
  WorkspacePreferencesPatch,
} from '../shared/protocol-preferences.js';
import type {
  AvatarOverrideInput,
  AvatarOverrideSource,
} from './storage-avatar-overrides-repository.js';

export type { RuntimeNetworkCatalog, RuntimeStore } from './runtime-store.js';

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
    peerIdentity?: NetworkUserIdentity | null,
  ): { buffer: BufferState; messages: readonly ServerMessage[] };
  closeBuffer(bufferId: string): { buffer: BufferState; messages: readonly ServerMessage[] };
  clearBufferHistory(bufferId: string): { buffer: BufferState; messages: readonly ServerMessage[] };
  markBufferRead: RuntimeConversationService['markBufferRead'];
  saveBufferNotes: RuntimeConversationService['saveBufferNotes'];
  history: RuntimeConversationService['listBufferHistory'];
  searchHistory: RuntimeConversationService['searchBufferHistory'];
  searchLogs: RuntimeConversationService['searchLogs'];
  listLogSources: RuntimeConversationService['listLogSources'];
  exportHistory(bufferId: string): ReturnType<RuntimeConversationService['exportBufferHistory']>;
  listPinnedMessages: RuntimeConversationService['listPinnedMessages'];
  setMessagePinned: RuntimeConversationService['setMessagePinned'];
  pinnedMessageHistoryWindow: RuntimeConversationService['getPinnedMessageHistoryWindow'];
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

export type RuntimePreferenceMutations = {
  update(patch: WorkspacePreferencesPatch): {
    preferences: ReturnType<RuntimeStore['preferences']['get']>;
    messages: readonly ServerMessage[];
  };
  importLegacy(
    patch: WorkspacePreferencesPatch,
    avatars: readonly AvatarOverrideInput[],
    initiallySkippedAvatarOverrides?: number,
  ): {
    preferences: ReturnType<RuntimeStore['preferences']['get']>;
    avatarOverrides: ReturnType<RuntimeStore['avatarOverrides']['list']>;
    imported: boolean;
    skippedAvatarOverrides: number;
    messages: readonly ServerMessage[];
  };
};

export type RuntimeDraftMutations = {
  save(bufferId: string, body: string): {
    draft: ReturnType<RuntimeStore['drafts']['get']>;
    messages: readonly ServerMessage[];
  };
};

export type RuntimeAvatarOverrideMutations = {
  upsert(input: AvatarOverrideInput): {
    avatarOverride: ReturnType<RuntimeStore['avatarOverrides']['upsert']>;
    messages: readonly ServerMessage[];
  };
  remove(id: string): {
    avatarOverrideId: string;
    messages: readonly ServerMessage[];
  };
  source(id: string): AvatarOverrideSource | null;
};

export type RuntimeHttpApi = {
  assistant: {
    ask: RuntimeAiAssistantService['ask'];
    startLogin: RuntimeAiAssistantService['startLogin'];
    status: RuntimeAiAssistantService['status'];
  };
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
    clearHistory: RuntimeConversationMutations['clearBufferHistory'];
    markRead: RuntimeConversationMutations['markBufferRead'];
    saveNotes: RuntimeConversationMutations['saveBufferNotes'];
    history: RuntimeConversationMutations['history'];
    searchHistory: RuntimeConversationMutations['searchHistory'];
    exportHistory: RuntimeConversationMutations['exportHistory'];
    listPinnedMessages: RuntimeConversationMutations['listPinnedMessages'];
    setMessagePinned: RuntimeConversationMutations['setMessagePinned'];
    pinnedMessageHistoryWindow: RuntimeConversationMutations['pinnedMessageHistoryWindow'];
  };
  logs: {
    listSources: RuntimeConversationMutations['listLogSources'];
    search: RuntimeConversationMutations['searchLogs'];
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
  preferences: RuntimePreferenceMutations;
  drafts: RuntimeDraftMutations;
  avatarOverrides: RuntimeAvatarOverrideMutations;
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
  preferences: RuntimePreferenceMutations;
  drafts: RuntimeDraftMutations;
  avatarOverrides: RuntimeAvatarOverrideMutations;
  http: RuntimeHttpApi;
  ws: RuntimeWebSocketApi;
};
