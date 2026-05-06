import type { DesktopShellLayoutProps } from '../web/src/DesktopShellLayout.js';

export const createDesktopShellLayoutProps = (
  overrides: Partial<DesktopShellLayoutProps> = {},
): DesktopShellLayoutProps => ({
  header: {
    onOpenLogInspector: () => undefined,
    onOpenMemoryDiagnostics: () => undefined,
    onOpenNetworkManager: () => undefined,
    onOpenPreferences: () => undefined,
  },
  commandPalette: {
    onOpen: () => undefined,
    open: false,
  },
  selectedBufferId: 'buffer-1',
  rightSidebarKind: null,
  sidebar: <div>Sidebar</div>,
  chat: <div>Chat</div>,
  rightSidebar: <div>Details</div>,
  commandPaletteDialog: null,
  logInspectorDialog: null,
  memoryDiagnosticsDialog: null,
  preferencesDialog: null,
  networkManagerDialog: null,
  networkEditorDialog: null,
  ...overrides,
});
