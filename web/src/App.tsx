import { useMemo, useRef, useState } from 'react';
import { isSavedNetwork } from '../../shared/network-model.js';
import { reducer, initialState, useStateReducer } from './app-state.js';
import type { SocketHandle } from './client.js';
import { createConversationQueries } from './conversation-selectors.js';
import { buildConnectionSidebarView } from './connection-sidebar-view.js';
import { useComposerHistory } from './composer-history.js';
import { DesktopShell } from './DesktopShell.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import type { EditorTab } from './network-form.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import { Toast } from './Toast.js';
import { useAppActions } from './useAppActions.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import { deriveWorkspace } from './workspace.js';

function App() {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const { draft, setDraft, recordComposerEntry, recallOlderDraft, recallNewerDraft } = useComposerHistory();
  const [showNetworkManager, setShowNetworkManager] = useState(false);
  const [showNetworkEditor, setShowNetworkEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('servers');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [messageDisplayMode, setMessageDisplayMode] = useState<MessageDisplayMode>('colors');
  const [managedNetworkId, setManagedNetworkId] = useState<string | null>(null);
  const socketRef = useRef<SocketHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoOpenManagerRef = useRef(false);

  const workspace = useMemo(
    () =>
      deriveWorkspace({
        networks: state.networks,
        buffers: state.buffers,
        channels: state.channels,
        pendingChannels: state.pendingChannels,
        networkStates: state.networkStates,
        selection: state.selection,
      }),
    [state.buffers, state.channels, state.networkStates, state.networks, state.pendingChannels, state.selection]
  );
  const conversation = useMemo(
    () => createConversationQueries(state),
    [state.buffers, state.channels, state.messages, state.pendingChannels]
  );

  const managerNetworks = useMemo(
    () => state.networks.filter(isSavedNetwork),
    [state.networks]
  );
  const visibleNetworks = useMemo(
    () => (showFavoritesOnly ? managerNetworks.filter((network) => network.favorite) : managerNetworks),
    [managerNetworks, showFavoritesOnly]
  );

  const managedNetwork = managerNetworks.find((network) => network.id === managedNetworkId) ?? null;
  const visibleManagedNetwork = visibleNetworks.find((network) => network.id === managedNetworkId) ?? null;
  const hiddenManagedNetworkName =
    managedNetwork && !visibleManagedNetwork && showFavoritesOnly ? managedNetwork.name : null;
  const managedRuntime = useMemo(
    () => buildManagedRuntime(visibleManagedNetwork, workspace.connectionInstances, state.networkStates),
    [state.networkStates, visibleManagedNetwork, workspace.connectionInstances]
  );
  const channelListNetwork = state.networks.find((network) => network.id === state.channelList.networkId) ?? null;

  const selectedMessages = useMemo(() => {
    return conversation.selectMessages(workspace.selectedBuffer);
  }, [conversation, workspace.selectedBuffer]);
  const sidebarConnections = useMemo(
    () =>
      buildConnectionSidebarView({
        networks: workspace.connectionInstances,
        buffers: state.buffers,
        pendingChannels: state.pendingChannels,
        networkStates: state.networkStates,
        selection: workspace.selection,
      }),
    [state.buffers, state.networkStates, state.pendingChannels, workspace.connectionInstances, workspace.selection]
  );

  useAppLifecycle({
    state,
    workspace,
    visibleNetworks,
    managedNetworkId,
    dispatch,
    setShowNetworkManager,
    setManagedNetworkId,
    socketRef,
    scrollRef,
    didAutoOpenManagerRef,
  });

  const actions = useAppActions({
    state,
    draft,
    workspace,
    dispatch,
    socketRef,
    setDraft,
    recordComposerEntry,
    updateBanner: (kind, message) => dispatch({ type: 'set-banner', banner: { kind, message } }),
  });

  const openNewNetworkEditorDialog = () =>
    openNewNetworkEditor({
      dispatch,
      setEditorTab,
      setManagedNetworkId,
      setShowNetworkManager,
      setShowNetworkEditor,
      state,
    });
  const openExistingNetworkEditorDialog = (network: typeof state.networks[number]) =>
    openExistingNetworkEditor(network, {
      dispatch,
      setEditorTab,
      setManagedNetworkId,
      setShowNetworkManager,
      setShowNetworkEditor,
    });
  const submitNetwork = async () => {
    const network = await actions.submitNetwork(state.networkForm);
    if (!network) {
      return;
    }
    setManagedNetworkId(network.id);
    setShowNetworkEditor(false);
    setShowNetworkManager(true);
  };
  const duplicateNetwork = async (network: typeof state.networks[number]) => {
    const duplicate = await actions.duplicateNetwork(network);
    if (duplicate) {
      setManagedNetworkId(duplicate.id);
    }
  };
  const connectNetwork = async (network: typeof state.networks[number]) => {
    if (await actions.connectNetwork(network)) {
      setShowNetworkManager(false);
    }
  };
  const closeNetworkEditor = () => {
    setShowNetworkEditor(false);
    setShowNetworkManager(true);
  };
  const headerProps = {
    messageDisplayMode,
    showMessageDisplayModeToggle: import.meta.env.DEV,
    onMessageDisplayModeChange: setMessageDisplayMode,
    onOpenNetworkManager: () => setShowNetworkManager(true),
  };
  const sidebarProps = {
    connections: sidebarConnections,
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
  };
  const chatProps = {
    workspace,
    friends: state.friends,
    selectedMessages,
    draft,
    messageDisplayMode,
    scrollRef,
    onDraftChange: setDraft,
    onRecallOlderDraft: recallOlderDraft,
    onRecallNewerDraft: recallNewerDraft,
    onSend: actions.sendComposer,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    channelList: state.channelList,
    channelListNetwork,
    onCloseChannelList: actions.closeChannelList,
    onJoinChannelFromList: actions.joinChannelFromList,
    onOpenMentionedChannel: actions.openMentionedChannel,
    onOpenChannelList: actions.openChannelList,
    onCloseChannel: actions.closeChannel,
    onCloseBuffer: actions.closeBuffer,
  };
  const nicklistProps = {
    friends: state.friends,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectNick: actions.selectPrivateBuffer,
  };
  const networkManagerProps = {
    open: showNetworkManager,
    networks: visibleNetworks,
    selected: visibleManagedNetwork,
    runtime: managedRuntime,
    showFavoritesOnly,
    hiddenManagedNetworkName: hiddenManagedNetworkName,
    onSelect: setManagedNetworkId,
    onToggleFavorites: () => setShowFavoritesOnly((value) => !value),
    onClose: () => setShowNetworkManager(false),
    onAdd: openNewNetworkEditorDialog,
    onEdit: () => visibleManagedNetwork && openExistingNetworkEditorDialog(visibleManagedNetwork),
    onDuplicate: () => visibleManagedNetwork && duplicateNetwork(visibleManagedNetwork),
    onRemove: () => visibleManagedNetwork && actions.deleteNetwork(visibleManagedNetwork.id),
    onConnect: () => visibleManagedNetwork && connectNetwork(visibleManagedNetwork),
    onFavorite: () =>
      visibleManagedNetwork && actions.saveFavorite(visibleManagedNetwork, !visibleManagedNetwork.favorite),
  };
  const networkEditorProps = {
    open: showNetworkEditor,
    form: state.networkForm,
    activeTab: editorTab,
    onTabChange: setEditorTab,
    onClose: closeNetworkEditor,
    onSubmit: submitNetwork,
    onChange: (form: Partial<(typeof state.networkForm)>) => dispatch({ type: 'set-network-form', form }),
  };

  if (state.phase === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <DesktopShell
        workspace={workspace}
        header={headerProps}
        sidebar={sidebarProps}
        chat={chatProps}
        nicklist={nicklistProps}
        networkManager={networkManagerProps}
        networkEditor={networkEditorProps}
      />
      <Toast banner={state.banner} onDismiss={() => dispatch({ type: 'set-banner', banner: null })} />
    </>
  );
}
export default App;
