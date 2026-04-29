import type { CommandPaletteEntry } from './command-palette.js';
import type { PreferencesDialogProps } from './PreferencesDialog.js';
import type { BufferState, FriendState, MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import type { ChatPaneProps } from './ChatPane.js';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { EditorTab, NetworkForm } from './network-form.js';
import type {
  BackgroundDmAudioContact,
  BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import type { NetworkRuntimeState, WorkspaceView } from './workspace.js';

export type DesktopShellHeaderModel = {
  onOpenNetworkManager: () => void;
  onOpenPreferences: () => void;
};

export type DesktopShellCommandPaletteModel = {
  open: boolean;
  entries: CommandPaletteEntry[];
  onOpen: () => void;
  onClose: () => void;
};

export type DesktopShellNicklistModel = {
  friends: FriendState[];
  mutedNicks: MutedNickState[];
  backgroundDmAudio: Pick<BackgroundDmAudioSettings, 'contacts'>;
  onAddFriend: (nick: string) => Promise<boolean>;
  onAddNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onAddMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onRemoveNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onRemoveMutedNick: (mutedNickId: string) => Promise<boolean>;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export type DesktopShellNetworkManagerModel = {
  open: boolean;
  networks: NetworkProfile[];
  selected: NetworkProfile | null;
  runtime: NetworkRuntimeState | null;
  runtimes: Record<string, NetworkRuntimeState | null>;
  showFavoritesOnly: boolean;
  onSelect: (networkId: string) => void;
  onToggleFavorites: () => void;
  onClose: () => void;
  onAdd: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: (network: NetworkProfile) => void;
  onConnect: () => void;
  onFavorite: () => void;
};

export type DesktopShellNetworkEditorModel = {
  open: boolean;
  form: NetworkForm;
  activeTab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (form: Partial<NetworkForm>) => void;
};

export type DesktopShellServerProfileModel = {
  network: NetworkProfile | null;
  onEdit: () => void;
  onSaveNotes: (network: NetworkProfile, notes: string) => Promise<unknown>;
};

export type DesktopShellQueryProfileModel = {
  buffer: BufferState | null;
  network: NetworkProfile | null;
  onSaveNotes: (buffer: BufferState, notes: string) => Promise<BufferState | null>;
};

export type DesktopShellModel = {
  workspace: WorkspaceView;
  header: DesktopShellHeaderModel;
  commandPalette: DesktopShellCommandPaletteModel;
  sidebar: ConnectionSidebarProps;
  chat: ChatPaneProps;
  nicklist: DesktopShellNicklistModel;
  serverProfile?: DesktopShellServerProfileModel;
  queryProfile?: DesktopShellQueryProfileModel;
  preferences: PreferencesDialogProps;
  networkManager: DesktopShellNetworkManagerModel;
  networkEditor: DesktopShellNetworkEditorModel;
};
