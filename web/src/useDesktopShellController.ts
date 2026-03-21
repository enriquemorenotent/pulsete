import type { NetworkProfile } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import type { useAppActions } from './useAppActions.js';
import type { useAppDerivedState } from './useAppDerivedState.js';
import type { useAppUiState } from './useAppUiState.js';
import type { useComposerHistory } from './composer-history.js';

type DesktopShellControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  composer: ReturnType<typeof useComposerHistory>;
  derived: ReturnType<typeof useAppDerivedState>;
  dispatch: (action: Action) => void;
  state: State;
  ui: ReturnType<typeof useAppUiState>;
};

type NetworkEditorControllerParams = Pick<DesktopShellControllerParams, 'actions' | 'dispatch' | 'state' | 'ui'>;

type NetworkManagerControllerParams = Pick<DesktopShellControllerParams, 'actions' | 'derived' | 'dispatch' | 'ui'>;

const createOpenNewNetworkEditorDialog = (
  dispatch: (action: Action) => void,
  ui: ReturnType<typeof useAppUiState>
) => () =>
  openNewNetworkEditor({
    dispatch,
    setEditorTab: ui.setEditorTab,
    setManagedNetworkId: ui.setManagedNetworkId,
    setShowNetworkManager: ui.setShowNetworkManager,
    setShowNetworkEditor: ui.setShowNetworkEditor,
  });

function useNetworkEditorController({
  actions,
  dispatch,
  state,
  ui,
}: NetworkEditorControllerParams): DesktopShellProps['networkEditor'] {
  const submitNetwork = async () => {
    const network = await actions.submitNetwork(state.transient.networkForm);
    if (!network) {
      return;
    }
    ui.setManagedNetworkId(network.id);
    ui.setShowNetworkEditor(false);
    ui.setShowNetworkManager(true);
  };

  return {
    open: ui.showNetworkEditor,
    form: state.transient.networkForm,
    activeTab: ui.editorTab,
    onTabChange: ui.setEditorTab,
    onClose: () => {
      ui.setShowNetworkEditor(false);
      ui.setShowNetworkManager(true);
    },
    onSubmit: submitNetwork,
    onChange: (form) => dispatch({ type: 'set-network-form', form }),
  };
}

function useNetworkManagerController({
  actions,
  derived,
  dispatch,
  ui,
}: NetworkManagerControllerParams): DesktopShellProps['networkManager'] {
  const openNewNetworkEditorDialog = createOpenNewNetworkEditorDialog(dispatch, ui);

  const openExistingNetworkEditorDialog = (network: NetworkProfile) =>
    openExistingNetworkEditor(network, {
      dispatch,
      setEditorTab: ui.setEditorTab,
      setManagedNetworkId: ui.setManagedNetworkId,
      setShowNetworkManager: ui.setShowNetworkManager,
      setShowNetworkEditor: ui.setShowNetworkEditor,
    });

  const duplicateNetwork = async (network: NetworkProfile) => {
    const duplicate = await actions.duplicateNetwork(network);
    if (duplicate) {
      ui.setManagedNetworkId(duplicate.id);
    }
  };

  const connectNetwork = async (network: NetworkProfile) => {
    if (await actions.connectNetwork(network)) {
      ui.setShowNetworkManager(false);
    }
  };

  return {
    open: ui.showNetworkManager,
    networks: derived.visibleNetworks,
    selected: derived.visibleManagedNetwork,
    runtime: derived.managedRuntime,
    showFavoritesOnly: ui.showFavoritesOnly,
    hiddenManagedNetworkName: derived.hiddenManagedNetworkName,
    onSelect: ui.setManagedNetworkId,
    onToggleFavorites: () => ui.setShowFavoritesOnly((value) => !value),
    onClose: () => ui.setShowNetworkManager(false),
    onAdd: openNewNetworkEditorDialog,
    onEdit: () => derived.visibleManagedNetwork && openExistingNetworkEditorDialog(derived.visibleManagedNetwork),
    onDuplicate: () => derived.visibleManagedNetwork && duplicateNetwork(derived.visibleManagedNetwork),
    onRemove: () => derived.visibleManagedNetwork && actions.deleteNetwork(derived.visibleManagedNetwork.id),
    onConnect: () => derived.visibleManagedNetwork && connectNetwork(derived.visibleManagedNetwork),
    onFavorite: () =>
      derived.visibleManagedNetwork
      && actions.saveFavorite(derived.visibleManagedNetwork, !derived.visibleManagedNetwork.favorite),
  };
}

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
    header: {
      messageDisplayMode: ui.messageDisplayMode,
      showMessageDisplayModeToggle: import.meta.env.DEV,
      onMessageDisplayModeChange: ui.setMessageDisplayMode,
      onOpenNetworkManager: () => ui.setShowNetworkManager(true),
    },
    sidebar: {
      connections: derived.sidebarConnections,
      friends: state.domain.friends,
      friendPresence: state.domain.friendPresence,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      onSelectFriend: actions.selectFriend,
      onSelectNetwork: actions.selectNetworkBuffer,
      onSelectBuffer: actions.selectTabBuffer,
      onSelectPendingChannel: actions.selectPendingTab,
      onReconnectNetwork: actions.reconnectNetwork,
      onDisconnectNetwork: actions.disconnectNetwork,
      onCloseConnection: actions.closeConnection,
      onCloseChannel: actions.closeChannel,
      onCloseBuffer: actions.closeBuffer,
    },
    chat: {
      workspace: derived.workspace,
      friends: state.domain.friends,
      selectedMessages: derived.selectedMessages,
      draft: composer.draft,
      messageDisplayMode: ui.messageDisplayMode,
      scrollRef: ui.scrollRef,
      onDraftChange: composer.setDraft,
      onRecallOlderDraft: composer.recallOlderDraft,
      onRecallNewerDraft: composer.recallNewerDraft,
      onSend: actions.sendComposer,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      channelList: state.transient.channelList,
      channelListNetwork: derived.channelListNetwork,
      onCloseChannelList: actions.closeChannelList,
      onJoinChannelFromList: actions.joinChannelFromList,
      onOpenMentionedChannel: actions.openMentionedChannel,
      onOpenChannelList: actions.openChannelList,
      onCloseChannel: actions.closeChannel,
      onCloseBuffer: actions.closeBuffer,
    },
    nicklist: {
      friends: state.domain.friends,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      onSelectNick: actions.selectPrivateBuffer,
    },
    networkManager: useNetworkManagerController({ actions, derived, dispatch, ui }),
    networkEditor: useNetworkEditorController({ actions, dispatch, state, ui }),
  };
}
