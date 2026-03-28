import type {
  AssistantItem,
  AssistantSnapshot,
  AssistantThread,
  AssistantTurn,
  AppSnapshot,
  BufferState,
  ChannelState,
  ChannelListEntry,
  ChannelUserState,
  ChatMessage,
  FriendState,
  NetworkProfile,
  PendingChannelState,
  PresenceStatus,
} from '../../shared/protocol.js';
import type { ConversationMessages } from './conversation-message-state.js';
import type { EditorTab, NetworkForm } from './network-form.js';
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

export type NetworkEditorState = {
  kind: 'new' | 'existing';
  tab: EditorTab;
  form: NetworkForm;
};

export type NetworkManagerState = {
  mode: 'closed' | 'manager' | 'editor';
  managedNetworkId: string | null;
  showFavoritesOnly: boolean;
  editor: NetworkEditorState | null;
};

export type AssistantState = {
  attemptedThreadId: string | null;
  loadingThreadId: string | null;
  selectedThreadId: string | null;
};

export type AppDomainState = {
  phase: 'loading' | 'ready';
  gatewayStatus: GatewayStatus;
  networks: NetworkProfile[];
  friends: FriendState[];
  friendPresence: Record<string, PresenceStatus>;
  queryPresence: Record<string, PresenceStatus>;
  buffers: BufferState[];
  channels: ChannelState[];
  pendingChannels: PendingChannelState[];
  messages: ConversationMessages;
  networkStates: Record<string, NetworkRuntimeState>;
  assistant: AssistantSnapshot;
  assistantThreads: Record<string, AssistantThread>;
};

export type AppTransientState = {
  selection: SelectedBuffer | null;
  banner: Banner;
  channelList: ChannelListState;
  historyLoading: boolean;
  historyLoadingOlder: boolean;
  historyLoadedByBufferId: Record<string, true>;
  historyHasOlderByBufferId: Record<string, boolean>;
  assistant: AssistantState;
  networkManager: NetworkManagerState;
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
  | { type: 'friend-presence'; friendId: string; presence: PresenceStatus }
  | { type: 'query-presence'; bufferId: string; presence: PresenceStatus }
  | { type: 'upsert-buffer'; buffer: BufferState }
  | { type: 'remove-buffer'; bufferId: string; networkId: string }
  | { type: 'select'; selection: SelectedBuffer | null }
  | { type: 'append-message'; message: ChatMessage }
  | { type: 'upsert-message'; message: ChatMessage }
  | { type: 'append-messages'; messages: ChatMessage[] }
  | { type: 'prepend-messages'; messages: ChatMessage[] }
  | { type: 'remove-messages'; networkId: string; target: string; messageIds: string[] }
  | { type: 'upsert-channel'; channel: ChannelState }
  | { type: 'remove-channel'; channelId: string; networkId: string }
  | { type: 'add-pending-channel'; pendingChannel: PendingChannelState }
  | { type: 'remove-pending-channel'; networkId: string; channel: string }
  | { type: 'update-presence'; networkId: string; channel: string; users: ChannelUserState[] }
  | { type: 'network-state'; networkId: string; phase: NetworkRuntimeState['phase']; serverName: string | null; nick: string }
  | { type: 'assistant-snapshot'; assistant: AssistantSnapshot }
  | { type: 'assistant-thread-loaded'; thread: AssistantThread }
  | { type: 'assistant-thread-removed'; threadId: string }
  | { type: 'assistant-thread-stop-requested'; threadId: string }
  | { type: 'assistant-turn-started'; threadId: string; turn: AssistantTurn }
  | { type: 'assistant-turn-completed'; threadId: string; turn: AssistantTurn }
  | { type: 'assistant-item-started'; threadId: string; turnId: string; item: AssistantItem }
  | { type: 'assistant-item-delta'; threadId: string; turnId: string; itemId: string; delta: string }
  | { type: 'assistant-item-completed'; threadId: string; turnId: string; item: AssistantItem }
  | { type: 'set-banner'; banner: Banner }
  | { type: 'open-channel-list'; networkId: string }
  | { type: 'close-channel-list' }
  | { type: 'channel-list-started'; networkId: string; requestId: string }
  | { type: 'channel-list-entry'; networkId: string; requestId: string; entry: ChannelListEntry }
  | { type: 'channel-list-completed'; networkId: string; requestId: string }
  | { type: 'channel-list-failed'; networkId: string; requestId: string; message: string }
  | { type: 'set-assistant-loading-thread'; threadId: string | null }
  | { type: 'select-assistant-thread'; threadId: string | null }
  | { type: 'open-network-manager' }
  | { type: 'close-network-manager' }
  | { type: 'set-network-manager-favorites'; value: boolean }
  | { type: 'set-managed-network'; networkId: string | null }
  | { type: 'open-network-editor'; editor: NetworkEditorState; managedNetworkId: string | null }
  | { type: 'close-network-editor' }
  | { type: 'set-network-editor-tab'; tab: EditorTab }
  | { type: 'update-network-editor-form'; form: Partial<NetworkForm> }
  | { type: 'set-history-loading'; value: boolean }
  | { type: 'set-history-loading-older'; value: boolean }
  | { type: 'history-buffer-loaded'; bufferId: string; hasOlder: boolean }
  | { type: 'remove-network'; networkId: string };
