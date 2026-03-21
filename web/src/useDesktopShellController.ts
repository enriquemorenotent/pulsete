import type { Action, State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppActions } from './useAppActions.js';
import type { useAppDerivedState } from './useAppDerivedState.js';
import type { useAppUiState } from './useAppUiState.js';
import type { useComposerHistory } from './composer-history.js';
import { useChatController } from './useChatController.js';
import { useHeaderController } from './useHeaderController.js';
import { useNetworkEditorController } from './useNetworkEditorController.js';
import { useNetworkManagerController } from './useNetworkManagerController.js';
import { useNicklistController } from './useNicklistController.js';
import { useSidebarController } from './useSidebarController.js';

type DesktopShellControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  composer: ReturnType<typeof useComposerHistory>;
  derived: ReturnType<typeof useAppDerivedState>;
  dispatch: (action: Action) => void;
  state: State;
  ui: ReturnType<typeof useAppUiState>;
};

export function useDesktopShellController({
  actions,
  composer,
  derived,
  dispatch,
  state,
  ui,
}: DesktopShellControllerParams): DesktopShellProps {
  return {
    workspace: derived.workspace,
    header: useHeaderController({ dispatch, ui }),
    sidebar: useSidebarController({ actions, derived, state }),
    chat: useChatController({ actions, composer, derived, state, ui }),
    nicklist: useNicklistController({ actions, state }),
    networkManager: useNetworkManagerController({ actions, derived, dispatch, state }),
    networkEditor: useNetworkEditorController({ actions, dispatch, state }),
  };
}
