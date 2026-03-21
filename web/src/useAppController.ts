import type { NetworkProfile } from '../../shared/protocol.js';
import { initialState, reducer, useStateReducer } from './app-state.js';
import type { State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import { useAppActions } from './useAppActions.js';
import { useAppDerivedState } from './useAppDerivedState.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import { useAppUiState } from './useAppUiState.js';
import { useComposerHistory } from './composer-history.js';

type AppController = {
  banner: State['banner'];
  desktopShellProps: DesktopShellProps;
  dismissBanner: () => void;
  phase: State['phase'];
};

export function useAppController(): AppController {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const composer = useComposerHistory();
  const ui = useAppUiState();
  const derived = useAppDerivedState(state, ui.showFavoritesOnly, ui.managedNetworkId);
  const updateBanner = (kind: 'notice' | 'error', message: string) =>
    dispatch({ type: 'set-banner', banner: { kind, message } });

  useAppLifecycle({
    state,
    workspace: derived.workspace,
    visibleNetworks: derived.visibleNetworks,
    managedNetworkId: ui.managedNetworkId,
    dispatch,
    setShowNetworkManager: ui.setShowNetworkManager,
    setManagedNetworkId: ui.setManagedNetworkId,
    socketRef: ui.socketRef,
    scrollRef: ui.scrollRef,
    didAutoOpenManagerRef: ui.didAutoOpenManagerRef,
  });

  const actions = useAppActions({
    state,
    draft: composer.draft,
    workspace: derived.workspace,
    dispatch,
    socketRef: ui.socketRef,
    setDraft: composer.setDraft,
    recordComposerEntry: composer.recordComposerEntry,
    updateBanner,
  });

  const openNewNetworkEditorDialog = () =>
    openNewNetworkEditor({
      dispatch,
      setEditorTab: ui.setEditorTab,
      setManagedNetworkId: ui.setManagedNetworkId,
      setShowNetworkManager: ui.setShowNetworkManager,
      setShowNetworkEditor: ui.setShowNetworkEditor,
      state,
    });
  const openExistingNetworkEditorDialog = (network: NetworkProfile) =>
    openExistingNetworkEditor(network, {
      dispatch,
      setEditorTab: ui.setEditorTab,
      setManagedNetworkId: ui.setManagedNetworkId,
      setShowNetworkManager: ui.setShowNetworkManager,
      setShowNetworkEditor: ui.setShowNetworkEditor,
    });
  const submitNetwork = async () => {
    const network = await actions.submitNetwork(state.networkForm);
    if (!network) {
      return;
    }
    ui.setManagedNetworkId(network.id);
    ui.setShowNetworkEditor(false);
    ui.setShowNetworkManager(true);
  };
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
  const closeNetworkEditor = () => {
    ui.setShowNetworkEditor(false);
    ui.setShowNetworkManager(true);
  };

  return {
    phase: state.phase,
    banner: state.banner,
    dismissBanner: () => dispatch({ type: 'set-banner', banner: null }),
    desktopShellProps: {
      workspace: derived.workspace,
      header: {
        messageDisplayMode: ui.messageDisplayMode,
        showMessageDisplayModeToggle: import.meta.env.DEV,
        onMessageDisplayModeChange: ui.setMessageDisplayMode,
        onOpenNetworkManager: () => ui.setShowNetworkManager(true),
      },
      sidebar: {
        connections: derived.sidebarConnections,
        friends: state.friends,
        friendPresence: state.friendPresence,
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
        friends: state.friends,
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
        channelList: state.channelList,
        channelListNetwork: derived.channelListNetwork,
        onCloseChannelList: actions.closeChannelList,
        onJoinChannelFromList: actions.joinChannelFromList,
        onOpenMentionedChannel: actions.openMentionedChannel,
        onOpenChannelList: actions.openChannelList,
        onCloseChannel: actions.closeChannel,
        onCloseBuffer: actions.closeBuffer,
      },
      nicklist: {
        friends: state.friends,
        onAddFriend: actions.addFriend,
        onRemoveFriend: actions.removeFriend,
        onSelectNick: actions.selectPrivateBuffer,
      },
      networkManager: {
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
      },
      networkEditor: {
        open: ui.showNetworkEditor,
        form: state.networkForm,
        activeTab: ui.editorTab,
        onTabChange: ui.setEditorTab,
        onClose: closeNetworkEditor,
        onSubmit: submitNetwork,
        onChange: (form) => dispatch({ type: 'set-network-form', form }),
      },
    },
  };
}
