import type {
  AppSnapshot,
  BufferState,
  ChannelState,
  ChannelListEntry,
  ChannelUserState,
  ChatMessage,
  FriendState,
  NetworkProfile,
  PendingChannelState,
} from '../../shared/protocol.js';
import type { ConversationMessages } from './conversation-message-state.js';
import type { NetworkForm } from './network-form.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace-types.js';

export type Banner = { kind: 'notice' | 'error'; message: string } | null;
export type GatewayStatus = 'connecting' | 'connected' | 'disconnected';

export type ChannelListState = {
  open: boolean;
  networkId: string | null;
  requestId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: ChannelListEntry[];
  error: string | null;
};

export type AppDomainState = {
  phase: 'loading' | 'ready';
  gatewayStatus: GatewayStatus;
  networks: NetworkProfile[];
  friends: FriendState[];
  friendPresence: Record<string, boolean>;
  buffers: BufferState[];
  channels: ChannelState[];
  pendingChannels: PendingChannelState[];
  messages: ConversationMessages;
  networkStates: Record<string, NetworkRuntimeState>;
};

export type AppTransientState = {
  selection: SelectedBuffer | null;
  networkForm: NetworkForm;
  banner: Banner;
  channelList: ChannelListState;
  historyLoading: boolean;
};

export type State = {
  domain: AppDomainState;
  transient: AppTransientState;
};

export type Action =
  | { type: 'snapshot'; snapshot: AppSnapshot }
  | { type: 'gateway-connecting' }
  | { type: 'gateway-connected' }
  | { type: 'gateway-disconnected' }
  | { type: 'upsert-network'; network: NetworkProfile }
  | { type: 'upsert-friend'; friend: FriendState }
  | { type: 'remove-friend'; friendId: string }
  | { type: 'friend-presence'; friendId: string; online: boolean }
  | { type: 'upsert-buffer'; buffer: BufferState }
  | { type: 'remove-buffer'; bufferId: string; networkId: string }
  | { type: 'select'; selection: SelectedBuffer | null }
  | { type: 'append-message'; message: ChatMessage }
  | { type: 'append-messages'; messages: ChatMessage[] }
  | { type: 'upsert-channel'; channel: ChannelState }
  | { type: 'remove-channel'; channelId: string; networkId: string }
  | { type: 'add-pending-channel'; pendingChannel: PendingChannelState }
  | { type: 'remove-pending-channel'; networkId: string; channel: string }
  | { type: 'update-presence'; networkId: string; channel: string; users: ChannelUserState[] }
  | { type: 'network-state'; networkId: string; phase: NetworkRuntimeState['phase']; serverName: string | null; nick: string }
  | { type: 'set-banner'; banner: Banner }
  | { type: 'open-channel-list'; networkId: string }
  | { type: 'close-channel-list' }
  | { type: 'channel-list-started'; networkId: string; requestId: string }
  | { type: 'channel-list-entry'; networkId: string; requestId: string; entry: ChannelListEntry }
  | { type: 'channel-list-completed'; networkId: string; requestId: string }
  | { type: 'channel-list-failed'; networkId: string; requestId: string; message: string }
  | { type: 'set-network-form'; form: Partial<NetworkForm> }
  | { type: 'reset-network-form'; form?: Partial<NetworkForm> }
  | { type: 'set-history-loading'; value: boolean }
  | { type: 'remove-network'; networkId: string };
