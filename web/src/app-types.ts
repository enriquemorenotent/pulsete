import type { AppSnapshot } from '../../shared/protocol-app.js';
import type { BufferState, ChannelState, ChannelListEntry, ChannelUserState, ChatMessage, FriendState, MutedNickState, NetworkProfile, NickEmojiState, PendingChannelState, PresenceStatus } from '../../shared/protocol-chat.js';
import type { ConversationMessages } from './conversation-message-state.js';
import type { EditorTab, NetworkForm } from './network-form.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace-types.js';
import type {
  BufferDraft,
  UserAvatarOverride,
  WorkspacePreferences,
} from '../../shared/protocol-preferences.js';

export type Banner = { kind: 'notice' | 'error'; message: string } | null;
export type GatewayStatus = 'connecting' | 'connected' | 'disconnected';

export type ChannelListState = {
  open: boolean;
  networkId: string | null;
  requestId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: ChannelListEntry[];
  totalEntries: number | null;
  truncated: boolean;
  error: string | null;
};

export type NetworkEditorState = {
  kind: 'new' | 'existing';
  tab: EditorTab;
  returnMode: 'closed' | 'manager';
  form: NetworkForm;
};

export type NetworkManagerState = {
  mode: 'closed' | 'manager' | 'editor';
  managedNetworkId: string | null;
  showFavoritesOnly: boolean;
  editor: NetworkEditorState | null;
};

export type AppDomainState = {
  phase: 'loading' | 'ready';
  gatewayStatus: GatewayStatus;
  networks: NetworkProfile[];
  friends: FriendState[];
  mutedNicks: MutedNickState[];
  nickEmojis: NickEmojiState[];
  friendPresence: Record<string, PresenceStatus>;
  queryPresence: Record<string, PresenceStatus>;
  buffers: BufferState[];
  channels: ChannelState[];
  pendingChannels: PendingChannelState[];
  messages: ConversationMessages;
  pinnedMessages: ConversationMessages;
  networkStates: Record<string, NetworkRuntimeState>;
  preferences: WorkspacePreferences;
  userAvatarOverrides: UserAvatarOverride[];
  drafts: BufferDraft[];
  browserStorageImportPending: boolean;
};

export type AppTransientState = {
  selection: SelectedBuffer | null;
  banner: Banner;
  channelList: ChannelListState;
  historyLoadedByBufferId: Record<string, true>;
  historyHasOlderByBufferId: Record<string, boolean>;
  historyHasNewerByBufferId: Record<string, boolean>;
  pinnedMessagesLoadedByBufferId: Record<string, true>;
  messageFocusRequest: {
    bufferId: string;
    messageId: string;
    requestId: number;
  } | null;
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
  | { type: 'upsert-muted-nick'; mutedNick: MutedNickState }
  | { type: 'remove-muted-nick'; mutedNickId: string }
  | { type: 'upsert-nick-emoji'; nickEmoji: NickEmojiState }
  | { type: 'remove-nick-emoji'; nickEmojiId: string }
  | { type: 'update-preferences'; preferences: WorkspacePreferences }
  | { type: 'upsert-avatar-override'; avatarOverride: UserAvatarOverride }
  | { type: 'remove-avatar-override'; avatarOverrideId: string }
  | { type: 'upsert-draft'; draft: BufferDraft }
  | { type: 'remove-draft'; bufferId: string }
  | { type: 'complete-browser-storage-import' }
  | { type: 'friend-presence'; friendId: string; presence: PresenceStatus }
  | { type: 'query-presence'; bufferId: string; presence: PresenceStatus }
  | { type: 'upsert-buffer'; buffer: BufferState }
  | { type: 'remove-buffer'; bufferId: string; networkId: string; replacementBufferId?: string }
  | { type: 'select'; selection: SelectedBuffer | null }
  | { type: 'append-message'; message: ChatMessage }
  | { type: 'upsert-message'; message: ChatMessage }
  | { type: 'message-pin-updated'; message: ChatMessage }
  | { type: 'set-pinned-messages'; bufferId: string; messages: ChatMessage[] }
  | { type: 'append-messages'; messages: ChatMessage[] }
  | { type: 'prepend-messages'; messages: ChatMessage[] }
  | { type: 'remove-messages'; networkId: string; target: string; messageIds: string[]; bufferId?: string }
  | { type: 'upsert-channel'; channel: ChannelState }
  | { type: 'remove-channel'; channelId: string; networkId: string }
  | { type: 'add-pending-channel'; pendingChannel: PendingChannelState }
  | { type: 'remove-pending-channel'; networkId: string; channel: string }
  | { type: 'update-presence'; networkId: string; channel: string; users: ChannelUserState[] }
  | {
      type: 'network-state';
      networkId: string;
      phase: NetworkRuntimeState['phase'];
      serverName: string | null;
      nick: string;
      capabilities: NonNullable<NetworkRuntimeState['capabilities']>;
    }
  | { type: 'set-banner'; banner: Banner }
  | { type: 'open-channel-list'; networkId: string }
  | { type: 'close-channel-list' }
  | { type: 'channel-list-started'; networkId: string; requestId: string }
  | { type: 'channel-list-entry'; networkId: string; requestId: string; entry: ChannelListEntry }
  | { type: 'channel-list-entries'; networkId: string; requestId: string; entries: ChannelListEntry[] }
  | { type: 'channel-list-completed'; networkId: string; requestId: string; totalEntries?: number; truncated?: boolean }
  | { type: 'channel-list-failed'; networkId: string; requestId: string; message: string }
  | { type: 'open-network-manager' }
  | { type: 'close-network-manager' }
  | { type: 'set-network-manager-favorites'; value: boolean }
  | { type: 'set-managed-network'; networkId: string | null }
  | { type: 'open-network-editor'; editor: NetworkEditorState; managedNetworkId: string | null }
  | { type: 'close-network-editor' }
  | { type: 'set-network-editor-tab'; tab: EditorTab }
  | { type: 'update-network-editor-form'; form: Partial<NetworkForm> }
  | { type: 'history-buffer-loaded'; bufferId: string; hasOlder: boolean; hasNewer?: boolean }
  | {
      type: 'replace-message-window';
      bufferId: string;
      messages: ChatMessage[];
      hasOlder: boolean;
      hasNewer: boolean;
      focusMessageId?: string;
      focusRequestId?: number;
    }
  | { type: 'remove-network'; networkId: string };
