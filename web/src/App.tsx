import { useMemo, useRef, useState } from 'react';
import { reducer, initialState, useStateReducer } from './app-state.js';
import type { SocketHandle } from './client.js';
import { createConversationQueries } from './conversation-selectors.js';
import { buildConnectionSidebarView } from './connection-sidebar-view.js';
import { useComposerHistory } from './composer-history.js';
import { DesktopShell } from './DesktopShell.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import { getTemplateRootId, type EditorTab } from './network-form.js';
import { Toast } from './Toast.js';
import { useAppActions } from './useAppActions.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import { deriveWorkspace, type NetworkRuntimeState } from './workspace.js';

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
    () => state.networks.filter((network) => !network.managerHidden),
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
    setShowNetworkEditor,
    setShowNetworkManager,
    setManagedNetworkId,
    setEditorTab,
    setDraft,
    recordComposerEntry,
    updateBanner: (kind, message) => dispatch({ type: 'set-banner', banner: { kind, message } }),
  });

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
    onAdd: actions.openNewNetworkEditor,
    onEdit: () => visibleManagedNetwork && actions.openNetworkEditor(visibleManagedNetwork),
    onDuplicate: () => visibleManagedNetwork && actions.duplicateNetwork(visibleManagedNetwork),
    onRemove: () => visibleManagedNetwork && actions.deleteNetwork(visibleManagedNetwork.id),
    onConnect: () => visibleManagedNetwork && actions.connectNetwork(visibleManagedNetwork),
    onFavorite: () =>
      visibleManagedNetwork && actions.saveFavorite(visibleManagedNetwork, !visibleManagedNetwork.favorite),
  };
  const networkEditorProps = {
    open: showNetworkEditor,
    form: state.networkForm,
    activeTab: editorTab,
    onTabChange: setEditorTab,
    onClose: closeNetworkEditor,
    onSubmit: actions.submitNetwork,
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

function buildManagedRuntime(
  managedNetwork: (typeof initialState.networks)[number] | null,
  connectionInstances: typeof initialState.networks,
  networkStates: Record<string, NetworkRuntimeState>
) {
  if (!managedNetwork) {
    return null;
  }
  const instances = connectionInstances.filter((network) => getTemplateRootId(network) === managedNetwork.id);
  if (instances.some((network) => networkStates[network.id]?.phase === 'connected')) {
    return { phase: 'connected' as const, serverName: null, nick: managedNetwork.nick };
  }
  if (instances.some((network) => networkStates[network.id]?.phase === 'connecting')) {
    return { phase: 'connecting' as const, serverName: null, nick: managedNetwork.nick };
  }
  return instances.length > 0 ? { phase: 'offline' as const, serverName: null, nick: managedNetwork.nick } : null;
}

export default App;
