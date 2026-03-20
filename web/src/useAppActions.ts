import type { BufferState, ClientMessage, FriendState, NetworkProfile } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { Action, State } from './app-types.js';
import { api, type SocketHandle } from './client.js';
import { sendComposerMessage } from './composer-actions.js';
import { gatewayReconnectMessage, toGatewayErrorMessage } from './gateway.js';
import { resolveFriendSelection } from './friend-selection.js';
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
  recordComposerEntry: (value: string) => void;
  updateBanner: (kind: 'notice' | 'error', message: string) => void;
};

const selectBuffer = (dispatch: (action: Action) => void, buffer: BufferState) =>
  dispatch({ type: 'select', selection: { bufferId: buffer.id } });

export function useAppActions(params: AppActionParams) {
  const showNewNetworkEditor = () => openNewNetworkEditor(params);
  const showExistingNetworkEditor = (network: NetworkProfile) => openExistingNetworkEditor(network, params);
  const findServerBuffer = (networkId: string) =>
    params.state.buffers.find((buffer) => buffer.networkId === networkId && buffer.kind === 'server') ?? null;
  const findQueryBuffer = (networkId: string, nick: string) =>
    params.state.buffers.find(
      (buffer) =>
        buffer.networkId === networkId &&
        buffer.kind === 'query' &&
        isSameIrcIdentifier(buffer.target, nick)
    ) ?? null;
  const findChannelBuffer = (networkId: string, channel: string) =>
    params.state.buffers.find(
      (buffer) =>
        buffer.networkId === networkId &&
        buffer.kind === 'channel' &&
        isSameIrcIdentifier(buffer.target, channel)
    ) ?? null;
  const getGatewaySocket = (showBanner = true) => {
    if (params.state.gatewayStatus !== 'connected' || !params.socketRef.current) {
      if (showBanner) {
        params.updateBanner('error', gatewayReconnectMessage);
      }
      return null;
    }
    return params.socketRef.current;
  };
  const sendGatewayMessage = (message: ClientMessage, showBanner = true) => {
    const socket = getGatewaySocket(showBanner);
    if (!socket) {
      return false;
    }
    try {
      socket.send(message);
      return true;
    } catch {
      if (showBanner) {
        params.updateBanner('error', gatewayReconnectMessage);
      }
      return false;
    }
  };

  const openOrSelectQueryBuffer = async (network: NetworkProfile, nick: string) => {
    const existingBuffer = findQueryBuffer(network.id, nick);
    if (existingBuffer) {
      selectBuffer(params.dispatch, existingBuffer);
      return existingBuffer;
    }
    const result = await api.openQuery(network.id, nick);
    params.dispatch({ type: 'upsert-buffer', buffer: result.buffer });
    selectBuffer(params.dispatch, result.buffer);
    return result.buffer;
  };

  const openChannelListForNetwork = async (networkId: string) => {
    if (!getGatewaySocket()) {
      return;
    }
    const runtime = params.state.networkStates[networkId] ?? null;
    if (!runtime?.connected) {
      params.updateBanner('error', 'Connect the network before listing channels');
      return;
    }
    if (
      params.state.channelList.open
      && params.state.channelList.networkId === networkId
      && params.state.channelList.status === 'loading'
    ) {
      return;
    }
    if (!sendGatewayMessage({ type: 'channel.list.request', networkId })) {
      return;
    }
    params.dispatch({ type: 'open-channel-list', networkId });
  };

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
      if (result.serverBuffer) {
        params.dispatch({ type: 'upsert-buffer', buffer: result.serverBuffer });
      }
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

  const duplicateNetwork = async (network: NetworkProfile) => {
    try {
      const result = await api.duplicateNetwork(network.id);
      params.dispatch({ type: 'upsert-network', network: result.network });
      params.setManagedNetworkId(result.network.id);
      params.updateBanner('notice', 'Network duplicated');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to duplicate network');
    }
  };

  const connectNetwork = async (network: NetworkProfile) => {
    try {
      const instance = await api.saveNetwork(createConnectionInstancePayload(network));
      params.dispatch({ type: 'upsert-network', network: instance.network });
      if (instance.serverBuffer) {
        params.dispatch({ type: 'upsert-buffer', buffer: instance.serverBuffer });
        selectBuffer(params.dispatch, instance.serverBuffer);
      }
      params.dispatch({ type: 'network-connecting', networkId: instance.network.id, nick: instance.network.nick });
      await api.connectNetwork(instance.network.id);
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
      if (result.serverBuffer) {
        params.dispatch({ type: 'upsert-buffer', buffer: result.serverBuffer });
      }
      params.updateBanner('notice', favorite ? 'Marked as favorite' : 'Removed from favorites');
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to update favorite');
    }
  };

  const selectNetworkBuffer = (network: NetworkProfile) => {
    const buffer = params.state.buffers.find((candidate) => candidate.networkId === network.id && candidate.kind === 'server') ?? null;
    if (buffer) {
      selectBuffer(params.dispatch, buffer);
    }
  };

  const selectTabBuffer = (buffer: BufferState) => selectBuffer(params.dispatch, buffer);

  const openMentionedChannel = async (channelName: string) => {
    const network = params.workspace.selectedNetwork;
    if (!network) {
      return;
    }

    const existingBuffer = findChannelBuffer(network.id, channelName);

    if (existingBuffer) {
      selectBuffer(params.dispatch, existingBuffer);
      return;
    }

    if (!params.state.networkStates[network.id]?.connected) {
      params.updateBanner('error', `Connect first to join ${channelName}`);
      return;
    }

    try {
      const result = await api.openChannel(network.id, channelName, params.workspace.selectedBuffer?.id);
      params.dispatch({ type: 'upsert-buffer', buffer: result.buffer });
      selectBuffer(params.dispatch, result.buffer);
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : `Failed to join ${channelName}`);
    }
  };

  const openChannelList = async () => {
    const network = params.workspace.selectedNetwork;
    if (!network) {
      return;
    }
    await openChannelListForNetwork(network.id);
  };

  const closeChannelList = () => {
    const networkId = params.state.channelList.networkId;
    if (networkId) {
      sendGatewayMessage({ type: 'channel.list.cancel', networkId }, false);
    }
    params.dispatch({ type: 'close-channel-list' });
  };

  const joinChannelFromList = async (channel: string) => {
    const networkId = params.state.channelList.networkId;
    if (!networkId) {
      return;
    }
    const existingBuffer = findChannelBuffer(networkId, channel);
    if (existingBuffer) {
      selectBuffer(params.dispatch, existingBuffer);
      return;
    }
    try {
      const result = await api.openChannel(networkId, channel, findServerBuffer(networkId)?.id);
      params.dispatch({ type: 'upsert-buffer', buffer: result.buffer });
      selectBuffer(params.dispatch, result.buffer);
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : `Failed to join ${channel}`);
    }
  };

  const selectPrivateBuffer = async (network: NetworkProfile, nick: string) => {
    try {
      await openOrSelectQueryBuffer(network, nick);
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const selectFriend = async (friend: FriendState) => {
    const decision = resolveFriendSelection({
      nick: friend.nick,
      buffers: params.state.buffers,
      workspace: params.workspace,
      networkStates: params.state.networkStates,
    });

    if (decision.type === 'error') {
      params.updateBanner('error', decision.message);
      return;
    }

    if (decision.type === 'select') {
      selectBuffer(params.dispatch, decision.buffer);
      return;
    }

    try {
      await openOrSelectQueryBuffer(decision.network, friend.nick);
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const addFriend = async (nick: string) => {
    try {
      const result = await api.addFriend(nick);
      params.dispatch({ type: 'upsert-friend', friend: result.friend });
      params.updateBanner('notice', 'Friend saved');
      return true;
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to save friend');
      return false;
    }
  };

  const removeFriend = async (friendId: string) => {
    try {
      await api.removeFriend(friendId);
      params.dispatch({ type: 'remove-friend', friendId });
      params.updateBanner('notice', 'Friend removed');
      return true;
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to remove friend');
      return false;
    }
  };

  const closeChannel = (networkId: string, channel: string) => {
    const socket = getGatewaySocket();
    if (!socket) {
      return;
    }
    const buffer = params.state.buffers.find(
      (candidate) => candidate.networkId === networkId && candidate.kind === 'channel' && candidate.target === channel
    );
    try {
      socket.send({
        type: 'channel.part',
        networkId,
        channel,
        sourceBufferId: buffer?.id ?? params.workspace.selectedBuffer?.id,
      });
    } catch {
      params.updateBanner('error', gatewayReconnectMessage);
    }
  };

  const closeBuffer = async (buffer: BufferState) => {
    try {
      await api.closeBuffer(buffer.id);
      params.dispatch({ type: 'remove-buffer', networkId: buffer.networkId, bufferId: buffer.id });
    } catch (error) {
      params.updateBanner('error', error instanceof Error ? error.message : 'Failed to close private message');
    }
  };

  const sendComposer = async () => {
    if (params.draft.trim() && !getGatewaySocket()) {
      return;
    }
    try {
      const submitted = await sendComposerMessage({
        draft: params.draft,
        dispatch: params.dispatch,
        setDraft: params.setDraft,
        socket: getGatewaySocket(false),
        updateBanner: params.updateBanner,
        workspace: params.workspace,
        onOpenChannel: async (networkId, channel, sourceBufferId) => {
          const result = await api.openChannel(networkId, channel, sourceBufferId);
          params.dispatch({ type: 'upsert-buffer', buffer: result.buffer });
          selectBuffer(params.dispatch, result.buffer);
        },
        onOpenChannelList: openChannelListForNetwork,
        onOpenQuery: async (networkId, nick) => {
          const network = params.state.networks.find((candidate) => candidate.id === networkId) ?? null;
          if (!network) {
            throw new Error('Network not found');
          }
          await openOrSelectQueryBuffer(network, nick);
        },
      });
      if (submitted) {
        params.recordComposerEntry(submitted);
      }
    } catch (error) {
      params.updateBanner('error', toGatewayErrorMessage(error, 'Failed to send message'));
    }
  };

  return {
    addFriend,
    closeBuffer,
    closeChannelList,
    closeChannel,
    closeConnection,
    connectNetwork,
    duplicateNetwork,
    deleteNetwork,
    disconnectNetwork,
    openMentionedChannel,
    openChannelList,
    openNetworkEditor: showExistingNetworkEditor,
    openNewNetworkEditor: showNewNetworkEditor,
    reconnectNetwork,
    saveFavorite,
    selectFriend,
    joinChannelFromList,
    selectNetworkBuffer,
    selectPrivateBuffer,
    selectTabBuffer,
    sendComposer,
    submitNetwork,
    removeFriend,
  };
}
