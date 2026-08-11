import type {
  StoredNetworkProfile,
} from '../shared/network-model.js';
import type { AppSnapshot } from '../shared/protocol-app.js';
import type {
  BufferState,
  ChannelState,
  ChannelUserState,
  FriendState,
  LogSource,
  LogSourceKind,
  MutedNickState,
  NickEmojiState,
} from '../shared/protocol-chat.js';
import type {
  BufferInput,
  ChannelInput,
  FriendInput,
  MessagePage,
  MessageWindowPage,
  MessageSearchFilters,
  MessageSearchPage,
  MessageInput,
  MutedNickInput,
  NetworkInput,
  NickEmojiInput,
  RuntimeNetworkProfile,
} from './storage-types.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import type { QueryNickAliasRecord } from './storage-query-aliases.js';
import type { StoragePreferencesRepository } from './storage-preferences-repository.js';
import type { StorageDraftsRepository } from './storage-drafts-repository.js';
import type { StorageAvatarOverridesRepository } from './storage-avatar-overrides-repository.js';

export type RuntimeSnapshotSource = {
  listBuffers(networkId?: string): BufferState[];
  listChannels(networkId?: string): ChannelState[];
  listFriends(): FriendState[];
  listMutedNicks(networkId?: string): MutedNickState[];
  listNickEmojis(networkId?: string): NickEmojiState[];
  listNetworks(): StoredNetworkProfile[];
  listRecentMessages(limit?: number): AppSnapshot['messages'];
  listRecentMessagesForBufferIds(bufferIds: readonly string[], limit: number): AppSnapshot['messages'];
  getPreferences(): AppSnapshot['preferences'];
  isLegacyBrowserImportPending(): boolean;
  listDrafts(): AppSnapshot['drafts'];
  listAvatarOverrides(): AppSnapshot['userAvatarOverrides'];
};

export type RuntimeConversationStore = {
  listBuffers(networkId?: string): BufferState[];
  listChannels(networkId?: string): ChannelState[];
  listLogSources(filters: {
    kind?: LogSourceKind;
    networkId?: string;
    q?: string;
  }, limit: number): LogSource[];
  listQueryNickAliases(networkId?: string): QueryNickAliasRecord[];
  getBuffer(bufferId: string): BufferState | null;
  getBufferByTarget(networkId: string, target: string): BufferState | null;
  getServerBuffer(networkId: string): BufferState | null;
  getChannelByName(networkId: string, name: string): ChannelState | null;
  markBufferRead(bufferId: string, input: { lastReadTs: number | null; lastReadMessageId: string | null }): void;
  setBufferUnread(bufferId: string, unread: number, priorityUnread?: number): void;
  setBufferNotes(bufferId: string, notes: string): BufferState | null;
  removeBuffer(bufferId: string): BufferState | null;
  deleteChannelByName(networkId: string, channelName: string): void;
  updateChannelUsers(networkId: string, channelName: string, users: ChannelUserState[]): void;
  updateChannelTopic(networkId: string, channelName: string, topic: string): void;
  listMessages(networkId: string, target: string, limit?: number): AppSnapshot['messages'];
  listMessagePage(networkId: string, target: string, limit: number, beforeMessageId?: string): MessagePage;
  listAllMessages(networkId: string, target: string): AppSnapshot['messages'];
  listOpeningMessages(networkId: string, target: string, limit: number): AppSnapshot['messages'];
  listRecentMessagesForBuffer(networkId: string, target: string, limit: number): AppSnapshot['messages'];
  listRecentMessagesForBufferIds(bufferIds: readonly string[], limit: number): AppSnapshot['messages'];
  searchMessages(query: string, limit: number, filters?: MessageSearchFilters): MessageSearchPage;
  searchMessagesByBufferId(bufferId: string, query: string, limit: number): MessageSearchPage;
  getMessageById(messageId: string): AppSnapshot['messages'][number] | null;
  getMessageWindow(messageId: string, before: number, after: number): AppSnapshot['messages'];
  getMessageWindowPage(
    messageId: string,
    before: number,
    after: number,
  ): MessageWindowPage | null;
  listPinnedMessages(bufferId: string): AppSnapshot['messages'];
  setMessagePinned(
    messageId: string,
    pinned: boolean,
    now?: number,
  ): AppSnapshot['messages'][number] | null;
  deleteMessages(networkId: string, target: string): AppSnapshot['messages'];
  deleteMessagesByIdPrefixes(prefixes: string[]): AppSnapshot['messages'];
  upsertChannel(input: ChannelInput): ChannelState;
  upsertBuffer(input: BufferInput): BufferState;
  upsertQuery(
    networkId: string,
    target: string,
    peerIdentity?: NetworkUserIdentity | null,
    ircCloudAvatarId?: string,
  ): BufferState;
  upsertQueryWithMergeResult(
    networkId: string,
    target: string,
    peerIdentity?: NetworkUserIdentity | null,
    ircCloudAvatarId?: string,
  ): { buffer: BufferState; removedBufferIds: string[]; retargetedFrom?: string | null };
  recordObservedQueryNickChange(
    networkId: string,
    fromTarget: string,
    toTarget: string,
  ): { buffer: BufferState; removedBufferIds: string[]; retargetedFrom?: string | null; bufferOpen: boolean } | null;
  appendMessage(input: MessageInput, bufferId?: string): AppSnapshot['messages'][number];
};

export type RuntimeFriendStore = {
  list(): FriendState[];
  get(friendId: string): FriendState | null;
  upsert(input: FriendInput): FriendState;
  remove(friendId: string): FriendState | null;
};

export type RuntimeMutedNickStore = {
  list(networkId?: string): MutedNickState[];
  get(mutedNickId: string): MutedNickState | null;
  findByNick(networkId: string, nick: string): MutedNickState | null;
  findByIdentity(networkId: string, nick: string, identity: NetworkUserIdentity): MutedNickState | null;
  upsert(input: MutedNickInput): MutedNickState;
  remove(mutedNickId: string): MutedNickState | null;
};

export type RuntimeNickEmojiStore = {
  list(networkId?: string): NickEmojiState[];
  get(nickEmojiId: string): NickEmojiState | null;
  findByNick(networkId: string, nick: string): NickEmojiState | null;
  findByIdentity(networkId: string, identity: NetworkUserIdentity): NickEmojiState | null;
  upsert(input: NickEmojiInput): NickEmojiState;
  remove(nickEmojiId: string): NickEmojiState | null;
  removeByNick(networkId: string, nick: string): NickEmojiState | null;
  removeByIdentity(
    networkId: string,
    nick: string,
    identity: NetworkUserIdentity | null | undefined,
  ): NickEmojiState | null;
};

export type RuntimeNetworkStore = {
  list(): StoredNetworkProfile[];
  get(networkId: string): StoredNetworkProfile | null;
  getRuntime(networkId: string): RuntimeNetworkProfile | null;
  upsert(input: NetworkInput): StoredNetworkProfile;
  setWorkspaceOpen(networkId: string, workspaceOpen: boolean): StoredNetworkProfile | null;
  delete(networkId: string): string[];
};

export type RuntimeNetworkCatalog = Pick<RuntimeNetworkStore, 'list'>;

export type RuntimeStore = {
  snapshotSource: RuntimeSnapshotSource;
  conversations: RuntimeConversationStore;
  friends: RuntimeFriendStore;
  mutedNicks: RuntimeMutedNickStore;
  networks: RuntimeNetworkStore;
  nickEmojis: RuntimeNickEmojiStore;
  preferences: StoragePreferencesRepository;
  drafts: StorageDraftsRepository;
  avatarOverrides: StorageAvatarOverridesRepository;
};
