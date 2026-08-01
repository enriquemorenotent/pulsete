import type { DesktopShellLayoutProps } from '../web/src/DesktopShellLayout.js';

export const createDesktopShellLayoutProps = (
  overrides: Partial<DesktopShellLayoutProps> = {},
): DesktopShellLayoutProps => ({
  header: {
    mediaVisibilityMode: 'show-media',
    onDownloadDiagnostics: () => undefined,
    onOpenLogInspector: () => undefined,
    onOpenNetworkManager: () => undefined,
    onOpenPreferences: () => undefined,
    onToggleMediaVisibilityMode: () => undefined,
  },
  commandPalette: {
    onOpen: () => undefined,
    open: false,
  },
  selectedBufferId: 'buffer-1',
  rightSidebarKind: null,
  rightSidebarCollapsed: false,
  sidebar: <div>Sidebar</div>,
  chat: <div>Chat</div>,
  rightSidebar: <div>Details</div>,
  commandPaletteDialog: null,
  logInspectorDialog: null,
  preferencesDialog: null,
  networkManagerDialog: null,
  networkEditorDialog: null,
  onJumpChatToLatest: () => undefined,
  leftSidebarWidth: 256,
  rightSidebarWidth: 256,
  onSetLeftSidebarWidth: () => undefined,
  onSetRightSidebarWidth: () => undefined,
  onExpandRightSidebar: () => undefined,
  ...overrides,
});
