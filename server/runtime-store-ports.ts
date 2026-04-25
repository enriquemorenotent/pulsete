import type {
  StoredNetworkProfile,
} from '../shared/network-model.js';
import type {
  AppSnapshot,
  BufferState,
  ChannelState,
  ChannelUserState,
  FriendState,
  MutedNickState,
} from '../shared/protocol.js';
import type {
  BufferInput,
  ChannelInput,
  FriendInput,
  MessagePage,
  MessageSearchPage,
  MessageInput,
  MutedNickInput,
  NetworkInput,
  RuntimeNetworkProfile,
} from './storage-types.js';

export type RuntimeSnapshotSource = {
  listBuffers(networkId?: string): BufferState[];
  listChannels(networkId?: string): ChannelState[];
  listFriends(): FriendState[];
  listMutedNicks(networkId?: string): MutedNickState[];
  listNetworks(): StoredNetworkProfile[];
  listRecentMessages(limit?: number): AppSnapshot['messages'];
};

export type RuntimeConversationStore = {
  listBuffers(networkId?: string): BufferState[];
  listChannels(networkId?: string): ChannelState[];
  getBuffer(bufferId: string): BufferState | null;
  getBufferByTarget(networkId: string, target: string): BufferState | null;
  getServerBuffer(networkId: string): BufferState | null;
  getChannelByName(networkId: string, name: string): ChannelState | null;
  markBufferRead(bufferId: string, input: { lastReadTs: number | null; lastReadMessageId: string | null }): void;
  setBufferUnread(bufferId: string, unread: number, priorityUnread?: number): void;
  removeBuffer(bufferId: string): BufferState | null;
  deleteChannelByName(networkId: string, channelName: string): void;
  updateChannelUsers(networkId: string, channelName: string, users: ChannelUserState[]): void;
  updateChannelTopic(networkId: string, channelName: string, topic: string): void;
  listMessages(networkId: string, target: string, limit?: number): AppSnapshot['messages'];
  listMessagePage(networkId: string, target: string, limit: number, beforeMessageId?: string): MessagePage;
  listAllMessages(networkId: string, target: string): AppSnapshot['messages'];
  listOpeningMessages(networkId: string, target: string, limit: number): AppSnapshot['messages'];
  listRecentMessagesForBuffer(networkId: string, target: string, limit: number): AppSnapshot['messages'];
  searchMessagesByBufferId(bufferId: string, query: string, limit: number): MessageSearchPage;
  getMessageWindow(messageId: string, before: number, after: number): AppSnapshot['messages'];
  deleteMessagesByIdPrefixes(prefixes: string[]): AppSnapshot['messages'];
  upsertChannel(input: ChannelInput): ChannelState;
  upsertBuffer(input: BufferInput): BufferState;
  upsertQuery(networkId: string, target: string): BufferState;
  recordObservedQueryNickChange(
    networkId: string,
    fromTarget: string,
    toTarget: string,
  ): { buffer: BufferState; removedBufferId: string | null } | null;
  appendMessage(input: MessageInput): AppSnapshot['messages'][number];
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
  upsert(input: MutedNickInput): MutedNickState;
  remove(mutedNickId: string): MutedNickState | null;
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
};
