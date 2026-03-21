import type { Action } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppUiState } from './useAppUiState.js';

type HeaderControllerParams = {
  dispatch: (action: Action) => void;
  ui: ReturnType<typeof useAppUiState>;
};

export function useHeaderController({
  dispatch,
  ui,
}: HeaderControllerParams): DesktopShellProps['header'] {
  return {
    messageDisplayMode: ui.messageDisplayMode,
    showMessageDisplayModeToggle: import.meta.env.DEV,
    onMessageDisplayModeChange: ui.setMessageDisplayMode,
    onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
  };
}
