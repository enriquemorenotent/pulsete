import type { State } from './app-types.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import {
  useChannelListNetwork,
  useConnectionInstances,
  useManagedNetworkModel,
  useSavedNetworks,
  useSelectedMessages,
  useSidebarConnections,
  useVisibleNetworks,
} from './useAppDerivedState.js';
import {
  useDesktopChatModel,
  useDesktopHeaderModel,
  useDesktopNicklistModel,
  useDesktopSidebarModel,
} from './useDesktopShellModel.js';
import { useAssistantController } from './useAssistantController.js';
import { useAppSession } from './useAppSession.js';
import { useAppUiState } from './useAppUiState.js';
import { useComposerHistory } from './composer-history.js';
import { useNetworkEditorController } from './useNetworkEditorController.js';
import { useNetworkManagerController } from './useNetworkManagerController.js';
import { usePreferencesController } from './usePreferencesController.js';
import type { DesktopShellModel } from './desktop-shell-model.js';

type AppController = {
  banner: State['transient']['banner'];
  shell: DesktopShellModel;
  dismissBanner: () => void;
  phase: State['domain']['phase'];
};

export function useAppController(): AppController {
  const composer = useComposerHistory();
  const ui = useAppUiState();
  const { actions, conversation, dispatch, serverMessages, state, workspace } = useAppSession({ composer, ui });
  const connectionInstances = useConnectionInstances(state.domain.networks);
  const savedNetworks = useSavedNetworks(state.domain.networks);
  const visibleNetworks = useVisibleNetworks(
    savedNetworks,
    state.transient.networkManager.showFavoritesOnly
  );
  const { managedRuntime, managedRuntimes, visibleManagedNetwork } = useManagedNetworkModel({
    connectionInstances,
    networkManager: state.transient.networkManager,
    networkStates: state.domain.networkStates,
    visibleNetworks,
  });
  const channelListNetwork = useChannelListNetwork(
    state.domain.networks,
    state.transient.channelList.networkId
  );
  const selectedMessages = useSelectedMessages(state.domain.messages, workspace.selectedBuffer);
  const sidebarConnections = useSidebarConnections(
    connectionInstances,
    conversation,
    state.domain.networkStates,
    workspace.selection,
  );

  useAppLifecycle({
    applyServerMessages: serverMessages.applyMutationMessages,
    applySocketMessage: serverMessages.applySocketMessage,
    banner: state.transient.banner,
    gatewayStatus: state.domain.gatewayStatus,
    networks: state.domain.networks,
    phase: state.domain.phase,
    networkManager: state.transient.networkManager,
    workspace,
    visibleNetworks,
    dispatch,
    socketRef: ui.socketRef,
    scrollRef: ui.scrollRef,
    didAutoOpenManagerRef: ui.didAutoOpenManagerRef,
  });

  const header = useDesktopHeaderModel({
    dispatch,
    ui,
  });
  const sidebar = useDesktopSidebarModel({
    actions,
    friends: state.domain.friends,
    friendPresence: state.domain.friendPresence,
    sidebarConnections,
  });
  const chat = useDesktopChatModel({
    actions,
    composer,
    friends: state.domain.friends,
    channelList: state.transient.channelList,
    channelListNetwork,
    selectedMessages,
    workspace,
    ui,
  });
  const nicklist = useDesktopNicklistModel({
    actions,
    friends: state.domain.friends,
  });
  const assistant = useAssistantController({
    actions,
    assistant: state.domain.assistant,
    assistantThreads: state.domain.assistantThreads,
    assistantUi: state.transient.assistant,
    workspace,
  });
  const preferences = usePreferencesController({
    actions,
    assistant: state.domain.assistant,
    ui,
  });
  const networkManager = useNetworkManagerController({
    actions,
    dispatch,
    managedRuntime,
    managedRuntimes,
    networkManager: state.transient.networkManager,
    visibleManagedNetwork,
    visibleNetworks,
  });
  const networkEditor = useNetworkEditorController({
    actions,
    dispatch,
    editor: state.transient.networkManager.editor,
    mode: state.transient.networkManager.mode,
  });
  const shell = {
    workspace,
    header,
    sidebar,
    chat,
    nicklist,
    assistant,
    preferences,
    networkManager,
    networkEditor,
  };

  return {
    phase: state.domain.phase,
    banner: state.transient.banner,
    dismissBanner: () => dispatch({ type: 'set-banner', banner: null }),
    shell,
  };
}
