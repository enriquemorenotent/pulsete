import type { ChannelState, NetworkProfile } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import { submitAuthRequest } from './auth-actions.js';
import { api, type SocketHandle } from './client.js';
import { sendComposerMessage } from './composer-actions.js';
import { openExistingNetworkEditor, openNewNetworkEditor } from './network-editor-actions.js';
import { createConnectionInstancePayload, parseAutoJoin, toForm, type EditorTab } from './network-form.js';
import type { WorkspaceView } from './workspace.js';

type MutableRef<T> = { current: T };

type AppActionParams = {
  state: State;
  draft: string;
  workspace: WorkspaceView;
  dispatch: (action: Action) => void;
  socketRef: MutableRef<SocketHandle | null>;
  setShowNetworkEditor: (value: boolean) => void;
  setShowNetworkManager: (value: boolean) => void;
  setManagedNetworkId: (value: string | null) => void;
  setEditorTab: (value: EditorTab) => void;
  setDraft: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

export function useAppActions(params: AppActionParams) {
  const submitAuth = async (mode: 'bootstrap' | 'login' | 'register') => {
    try {
      const session = await submitAuthRequest(mode, params.state.authForm.username, params.state.authForm.password);
      params.dispatch({ type: 'session-loaded', session });
      params.updateBanner('notice', mode === 'bootstrap' ? 'Instance bootstrapped' : mode === 'register' ? 'Account created' : 'Signed in');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Authentication failed');
    }
  };
  const showNewNetworkEditor = () => openNewNetworkEditor(params);
  const showExistingNetworkEditor = (network: NetworkProfile) => openExistingNetworkEditor(network, params);
  const submitNetwork = async () => {
    if (!params.state.networkForm.name.trim()) return params.updateBanner('error', 'Network name is required');
    if (!params.state.networkForm.host.trim()) return params.updateBanner('error', 'Server address is required');
    if (!params.state.networkForm.nick.trim()) return params.updateBanner('error', 'Nick name is required');
    try {
      const result = await api.saveNetwork({
        id: params.state.networkForm.id,
        name: params.state.networkForm.name.trim(),
        host: params.state.networkForm.host.trim(),
        port: Number(params.state.networkForm.port),
        tls: params.state.networkForm.tls,
        nick: params.state.networkForm.nick.trim(),
        altNicks: [params.state.networkForm.nick2.trim(), params.state.networkForm.nick3.trim()].filter(Boolean),
        username: params.state.networkForm.username.trim() || params.state.networkForm.nick.trim(),
        realName: params.state.networkForm.realName.trim() || params.state.networkForm.nick.trim(),
        password: params.state.networkForm.password.trim() || undefined,
        clearPassword: params.state.networkForm.password.trim()
          ? false
          : params.state.networkForm.clearPassword || undefined,
        favorite: params.state.networkForm.favorite,
        autoJoin: parseAutoJoin(params.state.networkForm.autoJoin),
      });
      params.dispatch({ type: 'upsert-network', network: result.network });
      params.dispatch({ type: 'reset-network-form', form: toForm(result.network) });
      params.setManagedNetworkId(result.network.id);
      params.setShowNetworkEditor(false);
      params.setShowNetworkManager(true);
      params.updateBanner('notice', 'Network saved');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to save network');
    }
  };
  const deleteNetwork = async (networkId: string) => {
    try {
      const result = await api.deleteNetwork(networkId);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        params.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      params.updateBanner('notice', 'Network deleted');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to delete network');
    }
  };
  const connectNetwork = async (network: NetworkProfile) => {
    try {
      const instance = await api.saveNetwork(createConnectionInstancePayload(network));
      params.dispatch({ type: 'upsert-network', network: instance.network });
      params.dispatch({ type: 'network-connecting', networkId: instance.network.id, nick: instance.network.nick });
      await api.connectNetwork(instance.network.id);
      params.dispatch({ type: 'select', selection: { networkId: instance.network.id, target: 'server', channelId: null } });
      params.setShowNetworkManager(false);
      params.updateBanner('notice', 'Opened connection instance');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to connect');
    }
  };
  const reconnectNetwork = async (network: NetworkProfile) => {
    try {
      params.dispatch({ type: 'network-connecting', networkId: network.id, nick: network.nick });
      await api.connectNetwork(network.id);
      params.updateBanner('notice', 'Reconnect requested');
    } catch (error) {
      params.dispatch({ type: 'network-state', networkId: network.id, connected: false, serverName: null, nick: network.nick });
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to reconnect');
    }
  };
  const disconnectNetwork = async (networkId: string) => {
    try {
      await api.disconnectNetwork(networkId);
      params.updateBanner('notice', 'Disconnect requested');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to disconnect');
    }
  };
  const closeConnection = async (network: NetworkProfile) => {
    try {
      const result = await api.deleteNetwork(network.id);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        params.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      params.updateBanner('notice', 'Connection instance closed');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to close connection');
    }
  };
  const saveFavorite = async (network: NetworkProfile, favorite: boolean) => {
    try {
      const result = await api.saveNetwork({ ...network, favorite });
      params.dispatch({ type: 'upsert-network', network: result.network });
      params.updateBanner('notice', favorite ? 'Marked as favorite' : 'Removed from favorites');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to update favorite');
    }
  };
  const selectNetworkBuffer = (network: NetworkProfile) =>
    params.dispatch({ type: 'select', selection: { networkId: network.id, target: 'server', channelId: null } });
  const selectChannelBuffer = (network: NetworkProfile, channel: ChannelState) =>
    params.dispatch({ type: 'select', selection: { networkId: network.id, target: channel.name, channelId: channel.id } });
  const selectPrivateBuffer = (network: NetworkProfile, nick: string) => {
    api
      .openQuery(network.id, nick)
      .then((result) => {
        params.dispatch({ type: 'upsert-query', query: result.query });
        params.dispatch({ type: 'select', selection: { networkId: network.id, target: nick, channelId: null } });
      })
      .catch((error) => params.updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message'));
  };
  const closeChannel = (networkId: string, channel: string) => {
    if (!params.socketRef.current) {
      params.updateBanner('error', 'Socket not connected');
      return;
    }
    params.socketRef.current.send({ type: 'channel.part', networkId, channel });
  };
  const closeQuery = async (networkId: string, target: string) => {
    try {
      await api.closeQuery(networkId, target);
      params.dispatch({ type: 'remove-query', networkId, target });
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to close private message');
    }
  };
  const sendComposer = () =>
    sendComposerMessage({
      draft: params.draft,
      dispatch: params.dispatch,
      setDraft: params.setDraft,
      socket: params.socketRef.current,
      updateBanner: params.updateBanner,
      workspace: params.workspace,
    });
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      params.socketRef.current?.close();
      params.socketRef.current = null;
    }
    params.dispatch({ type: 'session-loaded', session: await api.session() });
  };
  return {
    closeChannel,
    closeConnection,
    closeQuery,
    connectNetwork,
    deleteNetwork,
    disconnectNetwork,
    logout,
    openNetworkEditor: showExistingNetworkEditor,
    openNewNetworkEditor: showNewNetworkEditor,
    reconnectNetwork,
    saveFavorite,
    selectChannelBuffer,
    selectNetworkBuffer,
    selectPrivateBuffer,
    sendComposer,
    submitAuth,
    submitNetwork,
  };
}
