import { useMemo, useRef, useState } from 'react';
import { AuthScreen } from './AuthScreen.js';
import { reducer, initialState, useStateReducer } from './app-state.js';
import type { SocketHandle } from './client.js';
import { DesktopShell } from './DesktopShell.js';
import { getTemplateRootId, type EditorTab } from './network-form.js';
import { Toast } from './Toast.js';
import { useAppActions } from './useAppActions.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import { deriveWorkspace, type NetworkRuntimeState } from './workspace.js';

function App() {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const [draft, setDraft] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showNetworkManager, setShowNetworkManager] = useState(false);
  const [showNetworkEditor, setShowNetworkEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('servers');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [managedNetworkId, setManagedNetworkId] = useState<string | null>(null);
  const socketRef = useRef<SocketHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoOpenManagerRef = useRef(false);

  const workspace = useMemo(
    () =>
      deriveWorkspace({
        networks: state.networks,
        channels: state.channels,
        queries: state.queries,
        networkStates: state.networkStates,
        selection: state.selection,
      }),
    [state.channels, state.networkStates, state.networks, state.queries, state.selection]
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
    const selection = workspace.selection;
    if (!selection) {
      return [];
    }
    return state.messages.filter((message) => message.networkId === selection.networkId && message.target === selection.target);
  }, [state.messages, workspace.selection]);

  useAppLifecycle({
    state,
    workspace,
    visibleNetworks,
    managedNetworkId,
    dispatch,
    setLoadingAuth,
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
    updateBanner: (kind, message) => dispatch({ type: 'set-banner', banner: { kind, message } }),
  });

  const closeNetworkEditor = () => {
    setShowNetworkEditor(false);
    setShowNetworkManager(true);
  };

  if (loadingAuth || state.phase === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Loading Pulsete...
      </div>
    );
  }

  return (
    <>
      {state.phase === 'bootstrap' || state.phase === 'login' ? (
        <AuthScreen
          phase={state.phase}
          authMode={state.authMode}
          form={state.authForm}
          onModeChange={(mode) => dispatch({ type: 'set-auth-mode', mode })}
          onFieldChange={(field, value) => dispatch({ type: 'set-auth-form', field, value })}
          onSubmit={actions.submitAuth}
        />
      ) : (
        <DesktopShell
          workspace={workspace}
          connectionInstances={workspace.connectionInstances}
          channels={state.channels}
          queries={state.queries}
          networkStates={state.networkStates}
          selection={workspace.selection}
          selectedMessages={selectedMessages}
          draft={draft}
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
          onOpenNetworkManager={() => setShowNetworkManager(true)}
          onLogout={actions.logout}
          onDraftChange={setDraft}
          onSendComposer={actions.sendComposer}
          onReconnectNetwork={actions.reconnectNetwork}
          onDisconnectNetwork={actions.disconnectNetwork}
          onCloseConnection={actions.closeConnection}
          onSelectNetworkBuffer={actions.selectNetworkBuffer}
          onSelectChannelBuffer={actions.selectChannelBuffer}
          onSelectPrivateBuffer={actions.selectPrivateBuffer}
          onCloseChannel={actions.closeChannel}
          onCloseQuery={actions.closeQuery}
          onSelectManagedNetwork={setManagedNetworkId}
          onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
          onCloseNetworkManager={() => setShowNetworkManager(false)}
          onOpenNewNetworkEditor={actions.openNewNetworkEditor}
          onOpenManagedNetworkEditor={() => visibleManagedNetwork && actions.openNetworkEditor(visibleManagedNetwork)}
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
      )}
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
