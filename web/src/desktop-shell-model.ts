import type { AssistantPanelProps } from './AssistantPanel.js';
import type { CommandPaletteEntry } from './command-palette.js';
import type { PreferencesDialogProps } from './PreferencesDialog.js';
import type { FriendState, MutedNickState, NetworkProfile } from '../../shared/protocol.js';
import type { ChatPaneProps } from './ChatPane.js';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { EditorTab, NetworkForm } from './network-form.js';
import type { NetworkRuntimeState, WorkspaceView } from './workspace.js';

export type DesktopShellHeaderModel = {
  messageDisplayMode: MessageDisplayMode;
  showMessageDisplayModeToggle: boolean;
  onMessageDisplayModeChange: (mode: MessageDisplayMode) => void;
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
  onAddFriend: (nick: string) => Promise<boolean>;
  onAddMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
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
  onRemove: () => void;
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
};

export type DesktopShellModel = {
  workspace: WorkspaceView;
  header: DesktopShellHeaderModel;
  commandPalette: DesktopShellCommandPaletteModel;
  sidebar: ConnectionSidebarProps;
  chat: ChatPaneProps;
  nicklist: DesktopShellNicklistModel;
  assistant: AssistantPanelProps;
  serverProfile?: DesktopShellServerProfileModel;
  preferences: PreferencesDialogProps;
  networkManager: DesktopShellNetworkManagerModel;
  networkEditor: DesktopShellNetworkEditorModel;
};
