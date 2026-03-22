import { useMemo } from 'react';
import type { Action } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppUiState } from './useAppUiState.js';

type HeaderControllerParams = {
  dispatch: (action: Action) => void;
  messageDisplayMode: AppUiState['messageDisplayMode'];
  setMessageDisplayMode: AppUiState['setMessageDisplayMode'];
};

export function useHeaderController({
  dispatch,
  messageDisplayMode,
  setMessageDisplayMode,
}: HeaderControllerParams): DesktopShellModel['header'] {
  return useMemo(() => ({
    messageDisplayMode,
    showMessageDisplayModeToggle: import.meta.env.DEV,
    onMessageDisplayModeChange: setMessageDisplayMode,
    onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
  }), [dispatch, messageDisplayMode, setMessageDisplayMode]);
}
