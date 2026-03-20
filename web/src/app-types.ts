import type {
  AppSnapshot,
  BufferState,
  ChannelState,
  ChannelListEntry,
  ChannelUserState,
  ChatMessage,
  FriendState,
  NetworkProfile,
} from '../../shared/protocol.js';
import type { NetworkForm } from './network-form.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace-types.js';

export type Banner = { kind: 'notice' | 'error'; message: string } | null;

export type ChannelListState = {
  open: boolean;
  networkId: string | null;
  requestId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: ChannelListEntry[];
  error: string | null;
};

export type State = {
  phase: 'loading' | 'ready';
  networks: NetworkProfile[];
  friends: FriendState[];
  friendPresence: Record<string, boolean>;
  buffers: BufferState[];
  channels: ChannelState[];
  messages: ChatMessage[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
  networkForm: NetworkForm;
  banner: Banner;
  channelList: ChannelListState;
  historyLoading: boolean;
};

export type Action =
  | { type: 'snapshot-loaded'; snapshot: AppSnapshot }
  | { type: 'snapshot'; snapshot: AppSnapshot }
  | { type: 'upsert-network'; network: NetworkProfile }
  | { type: 'upsert-friend'; friend: FriendState }
  | { type: 'remove-friend'; friendId: string }
  | { type: 'friend-presence'; friendId: string; online: boolean }
  | { type: 'upsert-buffer'; buffer: BufferState }
  | { type: 'remove-buffer'; bufferId: string; networkId: string }
  | { type: 'load-failed' }
  | { type: 'select'; selection: SelectedBuffer }
  | { type: 'append-message'; message: ChatMessage }
  | { type: 'append-messages'; messages: ChatMessage[] }
  | { type: 'upsert-channel'; channel: ChannelState }
  | { type: 'remove-channel'; channelId: string; networkId: string }
  | { type: 'update-presence'; networkId: string; channel: string; users: ChannelUserState[] }
  | { type: 'network-connecting'; networkId: string; nick: string }
  | { type: 'network-state'; networkId: string; connected: boolean; serverName: string | null; nick: string }
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
