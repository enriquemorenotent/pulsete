import type { FriendState } from '../../shared/protocol.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';

export type CommandPaletteEntrySection = 'buffers' | 'friends' | 'actions';

export type CommandPaletteAction =
  | { kind: 'select-network'; networkId: string }
  | { kind: 'select-buffer'; bufferId: string }
  | { kind: 'select-pending-channel'; networkId: string; channel: string }
  | { kind: 'select-friend'; friendId: string }
  | { kind: 'open-preferences' }
  | { kind: 'open-network-manager' }
  | { kind: 'open-channel-list' }
  | { kind: 'toggle-current-channel-autojoin' }
  | { kind: 'download-buffer-history'; bufferId: string }
  | { kind: 'open-history-import'; bufferId: string }
  | { kind: 'open-self-aliases'; bufferId: string };

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
  openNetworkManager: () => void;
  openChannelList: () => void | Promise<void>;
  toggleCurrentChannelAutoJoin: () => void | Promise<void>;
  downloadBufferHistory: (bufferId: string) => void | Promise<void>;
  openHistoryImport: (bufferId: string) => void;
  openSelfAliases: (bufferId: string) => void;
};

export type BuildCommandPaletteEntrySpecsInput = {
  connections: SidebarConnectionView[];
  friends: FriendState[];
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
    canImportHistory: boolean;
    canOpenSelfAliases: boolean;
  };
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
