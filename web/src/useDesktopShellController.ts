import type { Action, State } from './app-types.js';
import type { AppModel } from './app-model.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppActions } from './useAppActions.js';
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
  dispatch: (action: Action) => void;
  model: AppModel;
  state: State;
  ui: ReturnType<typeof useAppUiState>;
};

export function useDesktopShellController({
  actions,
  composer,
  dispatch,
  model,
  state,
  ui,
}: DesktopShellControllerParams): DesktopShellProps {
  return {
    workspace: model.workspace,
    header: useHeaderController({ dispatch, ui }),
    sidebar: useSidebarController({ actions, model, state }),
    chat: useChatController({ actions, composer, model, state, ui }),
    nicklist: useNicklistController({ actions, state }),
    networkManager: useNetworkManagerController({ actions, dispatch, model, state }),
    networkEditor: useNetworkEditorController({ actions, dispatch, state }),
  };
}
