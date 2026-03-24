import type { AssistantPanelProps } from './AssistantPanel.js';
import type { PreferencesDialogProps } from './PreferencesDialog.js';
import type { FriendState, NetworkProfile } from '../../shared/protocol.js';
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

export type DesktopShellNicklistModel = {
  friends: FriendState[];
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectNick: (network: NetworkProfile, nick: string) => void;
};

export type DesktopShellNetworkManagerModel = {
  open: boolean;
  networks: NetworkProfile[];
  selected: NetworkProfile | null;
  runtime: NetworkRuntimeState | null;
  runtimes: Record<string, NetworkRuntimeState | null>;
  showFavoritesOnly: boolean;
  hiddenManagedNetworkName: string | null;
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

export type DesktopShellModel = {
  workspace: WorkspaceView;
  header: DesktopShellHeaderModel;
  sidebar: ConnectionSidebarProps;
  chat: ChatPaneProps;
  nicklist: DesktopShellNicklistModel;
  assistant: AssistantPanelProps;
  preferences: PreferencesDialogProps;
  networkManager: DesktopShellNetworkManagerModel;
  networkEditor: DesktopShellNetworkEditorModel;
};
