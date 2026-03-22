import type { Action, State } from './app-types.js';
import type { AppModel } from './app-model.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';
import type { ComposerController } from './composer-history.js';
import { useChatController } from './useChatController.js';
import { useHeaderController } from './useHeaderController.js';
import { useNetworkEditorController } from './useNetworkEditorController.js';
import { useNetworkManagerController } from './useNetworkManagerController.js';
import { useNicklistController } from './useNicklistController.js';
import { useSidebarController } from './useSidebarController.js';

type DesktopShellControllerParams = {
  actions: AppActions;
  composer: ComposerController;
  dispatch: (action: Action) => void;
  model: AppModel;
  transient: State['transient'];
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  ui: Pick<AppUiState, 'messageDisplayMode' | 'scrollRef' | 'setMessageDisplayMode'>;
};

export function useDesktopShellController({
  actions,
  composer,
  dispatch,
  model,
  transient,
  friends,
  friendPresence,
  ui,
}: DesktopShellControllerParams): DesktopShellProps {
  return {
    workspace: model.workspace,
    header: useHeaderController({
      dispatch,
      messageDisplayMode: ui.messageDisplayMode,
      setMessageDisplayMode: ui.setMessageDisplayMode,
    }),
    sidebar: useSidebarController({
      actions,
      connections: model.sidebarConnections,
      friendPresence,
      friends,
    }),
    chat: useChatController({
      actions,
      channelList: transient.channelList,
      channelListNetwork: model.channelListNetwork,
      composer,
      friends,
      messageDisplayMode: ui.messageDisplayMode,
      scrollRef: ui.scrollRef,
      selectedMessages: model.selectedMessages,
      workspace: model.workspace,
    }),
    nicklist: useNicklistController({ actions, friends }),
    networkManager: useNetworkManagerController({
      actions,
      dispatch,
      hiddenManagedNetworkName: model.hiddenManagedNetworkName,
      managedRuntime: model.managedRuntime,
      networkManager: transient.networkManager,
      visibleManagedNetwork: model.visibleManagedNetwork,
      visibleNetworks: model.visibleNetworks,
    }),
    networkEditor: useNetworkEditorController({
      actions,
      dispatch,
      editor: transient.networkManager.editor,
      mode: transient.networkManager.mode,
    }),
  };
}
