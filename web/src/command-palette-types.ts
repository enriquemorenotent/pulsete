import type { FriendState, NickEmojiState } from '../../shared/protocol-chat.js';
import type { NetworkImageRuntimePhase } from './network-image-state.js';
import type { NetworkServerImageSource } from './network-server-image.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { MediaVisibilityPolicy } from './media-visibility-settings.js';
import type {
  QueryAvatarOverrides,
  UserAvatarOverrides,
} from './user-avatars/query-overrides.js';

export type CommandPaletteEntrySection = 'unread' | 'buffers' | 'friends' | 'actions';

export type CommandPaletteAction =
  | { kind: 'select-network'; networkId: string }
  | { kind: 'select-buffer'; bufferId: string }
  | { kind: 'select-pending-channel'; networkId: string; channel: string }
  | { kind: 'select-friend'; friendId: string }
  | { kind: 'open-preferences' }
  | { kind: 'open-log-inspector' }
  | { kind: 'open-network-manager' }
  | { kind: 'open-channel-list' }
  | { kind: 'toggle-current-channel-autojoin' }
  | { kind: 'download-buffer-history'; bufferId: string };

export type CommandPaletteEntryRanking = {
  currentNetwork: boolean;
  priorityUnread: number;
  selected: boolean;
  unread: number;
};

export type CommandPaletteEntrySpec = {
  id: string;
  section: CommandPaletteEntrySection;
  label: string;
  emoji?: string | null;
  networkIconSource?: NetworkServerImageSource | null;
  networkIconUrl?: string | null;
  networkRuntimePhase?: NetworkImageRuntimePhase | null;
  subtitle: string | null;
  keywords: string[];
  badge: string | null;
  ranking: CommandPaletteEntryRanking;
  action: CommandPaletteAction;
};

export type CommandPaletteEntry = Omit<CommandPaletteEntrySpec, 'action'> & {
  onSelect: () => void | Promise<void>;
};

export type CommandPaletteActionHandlers = {
  selectNetwork: (networkId: string) => void;
  selectBuffer: (bufferId: string) => void;
  selectPendingChannel: (networkId: string, channel: string) => void;
  selectFriend: (friendId: string) => void | Promise<void>;
  openPreferences: () => void;
  openLogInspector: () => void;
  openNetworkManager: () => void;
  openChannelList: () => void | Promise<void>;
  toggleCurrentChannelAutoJoin: () => void | Promise<void>;
  downloadBufferHistory: (bufferId: string) => void | Promise<void>;
};

export type BuildCommandPaletteEntrySpecsInput = {
  connections: SidebarConnectionView[];
  externalAvatarsEnabled?: boolean;
  friends: FriendState[];
  mediaPolicy?: MediaVisibilityPolicy;
  nickEmojis: NickEmojiState[];
  queryAvatarOverrides?: QueryAvatarOverrides;
  selectedBuffer: {
    id: string | null;
    label: string | null;
  };
  selectedNetwork: {
    available: boolean;
    id: string | null;
    label: string | null;
  };
  actions: {
    canToggleChannelAutoJoin: boolean;
    channelAutoJoinActive: boolean;
    canDownloadHistory: boolean;
  };
  userAvatarOverrides?: UserAvatarOverrides;
};

export type CommandPaletteHotkeyEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};
