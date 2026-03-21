import type { NetworkProfile } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import { emptyNetworkForm } from './network-form.js';
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

type NetworkEditorControllerParams = Pick<DesktopShellControllerParams, 'actions' | 'dispatch' | 'state'>;

type NetworkManagerControllerParams = Pick<DesktopShellControllerParams, 'actions' | 'derived' | 'dispatch' | 'state'>;

const createOpenNewNetworkEditorDialog = (dispatch: (action: Action) => void) => () =>
  openNewNetworkEditor({
    dispatch,
  });

function useNetworkEditorController({
  actions,
  dispatch,
  state,
}: NetworkEditorControllerParams): DesktopShellProps['networkEditor'] {
  const editor = state.transient.networkManager.editor;

  const submitNetwork = async () => {
    if (!editor) {
      return;
    }
    const network = await actions.submitNetwork(editor.form);
    if (!network) {
      return;
    }
    dispatch({ type: 'set-managed-network', networkId: network.id });
    dispatch({ type: 'close-network-editor' });
  };

  return {
    open: state.transient.networkManager.mode === 'editor',
    form: editor?.form ?? emptyNetworkForm(),
    activeTab: editor?.tab ?? 'servers',
    onTabChange: (tab) => dispatch({ type: 'set-network-editor-tab', tab }),
    onClose: () => dispatch({ type: 'close-network-editor' }),
    onSubmit: submitNetwork,
    onChange: (form) => dispatch({ type: 'update-network-editor-form', form }),
  };
}

function useNetworkManagerController({
  actions,
  derived,
  dispatch,
  state,
}: NetworkManagerControllerParams): DesktopShellProps['networkManager'] {
  const openNewNetworkEditorDialog = createOpenNewNetworkEditorDialog(dispatch);
  const networkManager = state.transient.networkManager;

  const openExistingNetworkEditorDialog = (network: NetworkProfile) =>
    openExistingNetworkEditor(network, {
      dispatch,
    });

  const duplicateNetwork = async (network: NetworkProfile) => {
    const duplicate = await actions.duplicateNetwork(network);
    if (duplicate) {
      dispatch({ type: 'set-managed-network', networkId: duplicate.id });
    }
  };

  const connectNetwork = async (network: NetworkProfile) => {
    if (await actions.connectNetwork(network)) {
      dispatch({ type: 'close-network-manager' });
    }
  };

  return {
    open: networkManager.mode === 'manager',
    networks: derived.visibleNetworks,
    selected: derived.visibleManagedNetwork,
    runtime: derived.managedRuntime,
    showFavoritesOnly: networkManager.showFavoritesOnly,
    hiddenManagedNetworkName: derived.hiddenManagedNetworkName,
    onSelect: (networkId) => dispatch({ type: 'set-managed-network', networkId }),
    onToggleFavorites: () =>
      dispatch({
        type: 'set-network-manager-favorites',
        value: !networkManager.showFavoritesOnly,
      }),
    onClose: () => dispatch({ type: 'close-network-manager' }),
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
      onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
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
    networkManager: useNetworkManagerController({ actions, derived, dispatch, state }),
    networkEditor: useNetworkEditorController({ actions, dispatch, state }),
  };
}
