import { useMemo, useRef, useState } from 'react';
import { reducer, initialState, useStateReducer } from './app-state.js';
import type { SocketHandle } from './client.js';
import { useComposerHistory } from './composer-history.js';
import { DesktopShell } from './DesktopShell.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import { matchesBufferMessage } from './message-matching.js';
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
        networkStates: state.networkStates,
        selection: state.selection,
      }),
    [state.buffers, state.channels, state.networkStates, state.networks, state.selection]
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

  const selectedMessages = useMemo(() => {
    const selectedBuffer = workspace.selectedBuffer;
    if (!selectedBuffer) {
      return [];
    }
    return state.messages.filter(
      (message) => matchesBufferMessage(selectedBuffer, message)
    );
  }, [state.messages, workspace.selectedBuffer]);

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
        connectionInstances={workspace.connectionInstances}
        friends={state.friends}
        friendPresence={state.friendPresence}
        buffers={state.buffers}
        channels={state.channels}
        networkStates={state.networkStates}
        selection={workspace.selection}
        selectedMessages={selectedMessages}
        draft={draft}
        messageDisplayMode={messageDisplayMode}
        showMessageDisplayModeToggle={import.meta.env.DEV}
        scrollRef={scrollRef}
        showNetworkManager={showNetworkManager}
        showNetworkEditor={showNetworkEditor}
        managedNetwork={visibleManagedNetwork}
        managedRuntime={managedRuntime}
        visibleNetworks={visibleNetworks}
        showFavoritesOnly={showFavoritesOnly}
        hiddenManagedNetworkName={hiddenManagedNetworkName}
        networkForm={state.networkForm}
        editorTab={editorTab}
        onMessageDisplayModeChange={setMessageDisplayMode}
        onOpenNetworkManager={() => setShowNetworkManager(true)}
        onDraftChange={setDraft}
        onRecallOlderDraft={recallOlderDraft}
        onRecallNewerDraft={recallNewerDraft}
        onSendComposer={actions.sendComposer}
        onReconnectNetwork={actions.reconnectNetwork}
        onDisconnectNetwork={actions.disconnectNetwork}
        onCloseConnection={actions.closeConnection}
        onAddFriend={actions.addFriend}
        onRemoveFriend={actions.removeFriend}
        onSelectFriend={actions.selectFriend}
        onOpenMentionedChannel={actions.openMentionedChannel}
        onSelectNetworkBuffer={actions.selectNetworkBuffer}
        onSelectTabBuffer={actions.selectTabBuffer}
        onSelectPrivateBuffer={actions.selectPrivateBuffer}
        onCloseChannel={actions.closeChannel}
        onCloseBuffer={actions.closeBuffer}
        onSelectManagedNetwork={setManagedNetworkId}
        onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
        onCloseNetworkManager={() => setShowNetworkManager(false)}
        onOpenNewNetworkEditor={actions.openNewNetworkEditor}
        onOpenManagedNetworkEditor={() => visibleManagedNetwork && actions.openNetworkEditor(visibleManagedNetwork)}
        onDuplicateManagedNetwork={() => visibleManagedNetwork && actions.duplicateNetwork(visibleManagedNetwork)}
        onDeleteManagedNetwork={() => visibleManagedNetwork && actions.deleteNetwork(visibleManagedNetwork.id)}
        onConnectManagedNetwork={() => visibleManagedNetwork && actions.connectNetwork(visibleManagedNetwork)}
        onToggleFavoriteManagedNetwork={() =>
          visibleManagedNetwork && actions.saveFavorite(visibleManagedNetwork, !visibleManagedNetwork.favorite)
        }
        onCloseNetworkEditor={closeNetworkEditor}
        onSubmitNetwork={actions.submitNetwork}
        onNetworkFormChange={(form) => dispatch({ type: 'set-network-form', form })}
        onEditorTabChange={setEditorTab}
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
  if (instances.some((network) => networkStates[network.id]?.connected)) {
    return { connected: true, connecting: false, serverName: null, nick: managedNetwork.nick };
  }
  if (instances.some((network) => networkStates[network.id]?.connecting)) {
    return { connected: false, connecting: true, serverName: null, nick: managedNetwork.nick };
  }
  return instances.length > 0 ? { connected: false, connecting: false, serverName: null, nick: managedNetwork.nick } : null;
}

export default App;
