import type {
  ConnectionInstanceProfile,
  StoredNetworkProfile,
} from '../shared/network-model.js';
import type {
  SpeakerAttributionConfidence,
  SpeakerAttributionSource,
  SpeakerRole,
  AssistantThreadScope,
  AssistantTurn,
  AssistantPreferences,
  AssistantTaskKind,
  AssistantThreadSummary,
  AppSnapshot,
  BufferState,
  ChannelState,
  ChannelUserState,
  FriendState,
  MutedNickState,
  NetworkAuthMethod,
  NetworkProfile,
} from '../shared/protocol.js';

export type NetworkRow = {
  id: string;
  templateId: string | null;
  managerHidden: number;
  name: string;
  host: string;
  port: number;
  tls: number;
  nick: string;
  altNicks: string;
  historicalSelfNicks: string;
  username: string;
  realName: string;
  password: string | null;
  authMethod: NetworkAuthMethod;
  authTarget: string;
  authAccount: string;
  favorite: number;
  autoJoin: string;
  createdAt: number;
  updatedAt: number;
};

export type BufferRow = {
  id: string;
  networkId: string;
  kind: BufferState['kind'];
  target: string;
  unread: number;
  priorityUnread: number;
  lastReadTs: number | null;
  lastReadMessageId: string | null;
  selfNickAliases: string;
  createdAt: number;
  updatedAt: number;
};

export type ChannelRow = {
  id: string;
  topic: string;
  users: string;
  createdAt: number;
  updatedAt: number;
};

export type MessageRow = {
  id: string;
  networkId: string;
  target: string;
  nick: string | null;
  speakerRole: SpeakerRole | null;
  speakerNick: string | null;
  attributionSource: SpeakerAttributionSource | null;
  attributionConfidence: SpeakerAttributionConfidence | null;
  importBatchId: string | null;
  body: string;
  kind: string;
  self: number;
  ts: number;
};

export type HistoryImportBatchRow = {
  id: string;
  networkId: string;
  bufferId: string;
  target: string;
  selfNickSnapshot: string;
  createdAt: number;
};

export type FriendRow = {
  id: string;
  nick: string;
  createdAt: number;
  updatedAt: number;
};

export type MutedNickRow = {
  id: string;
  networkId: string;
  nick: string;
  createdAt: number;
  updatedAt: number;
};

export type AssistantThreadRow = {
  id: string;
  bufferId: string | null;
  networkId: string | null;
  target: string | null;
  scope: AssistantThreadScope;
  title: string;
  task: AssistantTaskKind;
  model: string;
  turnStatus: AssistantThreadSummary['turnStatus'];
  turnsJson: string;
  createdAt: number;
  updatedAt: number;
};

export type AssistantPreferencesRow = {
  id: number;
  defaultModel: string;
  activeThreadId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type RuntimeNetworkProfile = StoredNetworkProfile & {
  password?: string;
};

type NetworkWriteInput = {
  id?: string;
  password?: string;
  clearPassword?: boolean;
};

export type NetworkInput = Omit<NetworkProfile, 'id' | 'hasPassword'> & NetworkWriteInput;

export type NetworkSaveResult =
  | {
      requested: Extract<StoredNetworkProfile, { managerHidden: false }>;
      relatedInstances: ConnectionInstanceProfile[];
    }
  | {
      requested: ConnectionInstanceProfile;
      relatedInstances: [];
    };

export type ChannelInput = Omit<ChannelState, 'id' | 'topic' | 'users'> &
  Partial<Pick<ChannelState, 'id' | 'topic' | 'users'>> & {
    unread?: number;
  };

export type BufferInput = Omit<BufferState, 'id' | 'unread' | 'priorityUnread' | 'lastReadTs' | 'lastReadMessageId'> &
  Partial<Pick<BufferState, 'id' | 'unread' | 'priorityUnread' | 'lastReadTs' | 'lastReadMessageId'>>;

export type FriendInput = Omit<FriendState, 'id'> & Partial<Pick<FriendState, 'id'>>;

export type MutedNickInput = Omit<MutedNickState, 'id'> & Partial<Pick<MutedNickState, 'id'>>;

export type MessageInput = {
  id: string;
  networkId: string;
  target: string;
  nick: string | null;
  speakerRole?: SpeakerRole;
  speakerNick?: string | null;
  attributionSource?: SpeakerAttributionSource;
  attributionConfidence?: SpeakerAttributionConfidence;
  importBatchId?: string | null;
  body: string;
  kind: AppSnapshot['messages'][number]['kind'];
  self: boolean;
  ts: number;
};

export type MessageAttributionUpdate = {
  id: string;
  speakerRole: SpeakerRole;
  speakerNick: string | null;
  attributionSource: SpeakerAttributionSource;
  attributionConfidence: SpeakerAttributionConfidence;
  importBatchId?: string | null;
  self: boolean;
};

export type HistoryImportBatchInput = {
  id?: string;
  networkId: string;
  bufferId: string;
  target: string;
  selfNickSnapshot: string[];
  createdAt?: number;
};

export type MessagePage = {
  messages: AppSnapshot['messages'];
  hasMore: boolean;
};

export type AssistantThreadInput = Omit<AssistantThreadSummary, 'createdAt' | 'updatedAt'> & {
  createdAt?: number;
  updatedAt?: number;
};

export type AssistantThreadTurnsInput = {
  threadId: string;
  turns: AssistantTurn[];
};

export type StorageSnapshotSource = {
  listBuffers(networkId?: string): BufferState[];
  listChannels(networkId?: string): ChannelState[];
  listFriends(): FriendState[];
  listMutedNicks(networkId?: string): MutedNickState[];
  listNetworks(): StoredNetworkProfile[];
  listRecentMessages(limit?: number): AppSnapshot['messages'];
  listAssistantThreads(): AssistantThreadSummary[];
  getAssistantPreferences(): AssistantPreferences;
};

export type CountRow = { count: number };

export type NetworkCountRow = CountRow;

export type ChannelUsers = ChannelUserState[];
