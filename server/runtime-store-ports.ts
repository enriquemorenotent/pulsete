import type {
  StoredNetworkProfile,
} from '../shared/network-model.js';
import type {
  AssistantPreferences,
  AssistantThreadSummary,
  AppSnapshot,
  BufferState,
  ChannelState,
  ChannelUserState,
  FriendState,
} from '../shared/protocol.js';
import type {
  BufferInput,
  ChannelInput,
  FriendInput,
  MessageInput,
  NetworkInput,
  NetworkSaveResult,
  RuntimeNetworkProfile,
} from './storage-types.js';
import type {
  AssistantThreadInput,
} from './storage-types.js';

export type RuntimeSnapshotSource = {
  listBuffers(networkId?: string): BufferState[];
  listChannels(networkId?: string): ChannelState[];
  listFriends(): FriendState[];
  listNetworks(): StoredNetworkProfile[];
  listRecentMessages(limit?: number): AppSnapshot['messages'];
  listAssistantThreads(): AssistantThreadSummary[];
  getAssistantPreferences(): AssistantPreferences;
};

export type RuntimeConversationStore = {
  listBuffers(networkId?: string): BufferState[];
  listChannels(networkId?: string): ChannelState[];
  getBuffer(bufferId: string): BufferState | null;
  getBufferByTarget(networkId: string, target: string): BufferState | null;
  getServerBuffer(networkId: string): BufferState | null;
  getChannelByName(networkId: string, name: string): ChannelState | null;
  markBufferRead(bufferId: string): void;
  removeBuffer(bufferId: string): BufferState | null;
  deleteChannelByName(networkId: string, channelName: string): void;
  setBufferUnread(bufferId: string, unread: number): void;
  updateChannelUsers(networkId: string, channelName: string, users: ChannelUserState[]): void;
  updateChannelTopic(networkId: string, channelName: string, topic: string): void;
  listMessages(networkId: string, target: string, limit?: number): AppSnapshot['messages'];
  listAllMessages(networkId: string, target: string): AppSnapshot['messages'];
  upsertChannel(input: ChannelInput): ChannelState;
  upsertBuffer(input: BufferInput): BufferState;
  upsertQuery(networkId: string, target: string): BufferState;
  appendMessage(input: MessageInput): AppSnapshot['messages'][number];
};

export type RuntimeFriendStore = {
  list(): FriendState[];
  get(friendId: string): FriendState | null;
  upsert(input: FriendInput): FriendState;
  remove(friendId: string): FriendState | null;
};

export type RuntimeAssistantStore = {
  listThreads(): AssistantThreadSummary[];
  getThread(threadId: string): AssistantThreadSummary | null;
  upsertThread(input: AssistantThreadInput): AssistantThreadSummary | null;
  removeThread(threadId: string): void;
  getPreferences(): AssistantPreferences;
  savePreferences(input: AssistantPreferences): AssistantPreferences;
};

export type RuntimeNetworkStore = {
  list(): StoredNetworkProfile[];
  get(networkId: string): StoredNetworkProfile | null;
  getRuntime(networkId: string): RuntimeNetworkProfile | null;
  upsert(input: NetworkInput): StoredNetworkProfile;
  saveWithRelatedInstances(input: NetworkInput): NetworkSaveResult;
  deleteWithRelated(networkId: string): string[];
};

export type RuntimeNetworkCatalog = Pick<RuntimeNetworkStore, 'list'>;

export type RuntimeStore = {
  snapshotSource: RuntimeSnapshotSource;
  conversations: RuntimeConversationStore;
  friends: RuntimeFriendStore;
  networks: RuntimeNetworkStore;
  assistant: RuntimeAssistantStore;
};
