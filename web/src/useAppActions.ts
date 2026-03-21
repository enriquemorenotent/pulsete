import type { BufferState, ClientMessage, FriendState, NetworkProfile } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import { createConversationQueries } from './conversation-selectors.js';
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

type AppActionContext = AppActionParams & {
  conversation: ReturnType<typeof createConversationQueries>;
  getGatewaySocket: (showBanner?: boolean) => SocketHandle | null;
  sendGatewayMessage: (message: ClientMessage, showBanner?: boolean) => boolean;
  joinChannel: (networkId: string, channel: string, sourceBufferId?: string) => boolean;
  openOrSelectQueryBuffer: (network: NetworkProfile, nick: string) => Promise<BufferState>;
  openChannelListForNetwork: (networkId: string) => Promise<void>;
};

const selectBuffer = (dispatch: (action: Action) => void, buffer: BufferState) =>
  dispatch({ type: 'select', selection: { kind: 'buffer', bufferId: buffer.id } });

const selectPendingChannel = (dispatch: (action: Action) => void, networkId: string, channel: string) =>
  dispatch({ type: 'select', selection: { kind: 'pending-channel', networkId, channel } });

const createGatewayHelpers = (params: AppActionParams) => {
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

  return { getGatewaySocket, sendGatewayMessage };
};

const createConversationHelpers = (
  params: AppActionParams,
  conversation: ReturnType<typeof createConversationQueries>,
  sendGatewayMessage: AppActionContext['sendGatewayMessage'],
  getGatewaySocket: AppActionContext['getGatewaySocket']
) => {
  const joinChannel = (networkId: string, channel: string, sourceBufferId?: string) => {
    const existingBuffer = conversation.findChannelBuffer(networkId, channel);
    if (existingBuffer) {
      selectBuffer(params.dispatch, existingBuffer);
      return true;
    }

    if (conversation.findPendingChannel(networkId, channel)) {
      selectPendingChannel(params.dispatch, networkId, channel);
      return true;
    }

    const runtime = params.state.networkStates[networkId] ?? null;
    if (runtime?.phase !== 'connected') {
      params.updateBanner('error', `Connect first to join ${channel}`);
      return false;
    }

    if (!sendGatewayMessage({ type: 'channel.join', networkId, channel, sourceBufferId })) {
      return false;
    }

    selectPendingChannel(params.dispatch, networkId, channel);
    return true;
  };

  const openOrSelectQueryBuffer = async (network: NetworkProfile, nick: string) => {
    const existingBuffer = conversation.findQueryBuffer(network.id, nick);
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
    if (runtime?.phase !== 'connected') {
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

  return { joinChannel, openOrSelectQueryBuffer, openChannelListForNetwork };
};

const createNetworkActions = (context: AppActionContext) => {
  const showNewNetworkEditor = () => openNewNetworkEditor(context);
  const showExistingNetworkEditor = (network: NetworkProfile) => openExistingNetworkEditor(network, context);

  const submitNetwork = async () => {
    if (!context.state.networkForm.name.trim()) return context.updateBanner('error', 'Network name is required');
    if (!context.state.networkForm.host.trim()) return context.updateBanner('error', 'Server address is required');
    if (!context.state.networkForm.nick.trim()) return context.updateBanner('error', 'Nick name is required');
    try {
      const result = await api.saveNetwork({
        id: context.state.networkForm.id,
        name: context.state.networkForm.name.trim(),
        host: context.state.networkForm.host.trim(),
        port: Number(context.state.networkForm.port),
        tls: context.state.networkForm.tls,
        nick: context.state.networkForm.nick.trim(),
        altNicks: [context.state.networkForm.nick2.trim(), context.state.networkForm.nick3.trim()].filter(Boolean),
        username: context.state.networkForm.username.trim() || context.state.networkForm.nick.trim(),
        realName: context.state.networkForm.realName.trim() || context.state.networkForm.nick.trim(),
        password: context.state.networkForm.password.trim() || undefined,
        clearPassword: context.state.networkForm.password.trim()
          ? false
          : context.state.networkForm.clearPassword || undefined,
        favorite: context.state.networkForm.favorite,
        autoJoin: parseAutoJoin(context.state.networkForm.autoJoin),
      });
      context.dispatch({ type: 'upsert-network', network: result.network });
      if (result.serverBuffer) {
        context.dispatch({ type: 'upsert-buffer', buffer: result.serverBuffer });
      }
      context.dispatch({ type: 'reset-network-form', form: toForm(result.network) });
      context.setManagedNetworkId(result.network.id);
      context.setShowNetworkEditor(false);
      context.setShowNetworkManager(true);
      context.updateBanner('notice', 'Network saved');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to save network');
    }
  };

  const deleteNetwork = async (networkId: string) => {
    try {
      const result = await api.deleteNetwork(networkId);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        context.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      context.updateBanner('notice', 'Network deleted');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to delete network');
    }
  };

  const duplicateNetwork = async (network: NetworkProfile) => {
    try {
      const result = await api.duplicateNetwork(network.id);
      context.dispatch({ type: 'upsert-network', network: result.network });
      context.setManagedNetworkId(result.network.id);
      context.updateBanner('notice', 'Network duplicated');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to duplicate network');
    }
  };

  const connectNetwork = async (network: NetworkProfile) => {
    try {
      const instance = await api.saveNetwork(createConnectionInstancePayload(network));
      context.dispatch({ type: 'upsert-network', network: instance.network });
      if (instance.serverBuffer) {
        context.dispatch({ type: 'upsert-buffer', buffer: instance.serverBuffer });
        selectBuffer(context.dispatch, instance.serverBuffer);
      }
      await api.connectNetwork(instance.network.id);
      context.setShowNetworkManager(false);
      context.updateBanner('notice', 'Opened connection instance');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to connect');
    }
  };

  const reconnectNetwork = async (network: NetworkProfile) => {
    try {
      await api.connectNetwork(network.id);
      context.updateBanner('notice', 'Reconnect requested');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to reconnect');
    }
  };

  const disconnectNetwork = async (networkId: string) => {
    try {
      await api.disconnectNetwork(networkId);
      context.updateBanner('notice', 'Disconnect requested');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to disconnect');
    }
  };

  const closeConnection = async (network: NetworkProfile) => {
    try {
      const result = await api.deleteNetwork(network.id);
      for (const deletedNetworkId of result.deletedNetworkIds) {
        context.dispatch({ type: 'remove-network', networkId: deletedNetworkId });
      }
      context.updateBanner('notice', 'Connection instance closed');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to close connection');
    }
  };

  const saveFavorite = async (network: NetworkProfile, favorite: boolean) => {
    try {
      const result = await api.saveNetwork({ ...network, favorite });
      context.dispatch({ type: 'upsert-network', network: result.network });
      if (result.serverBuffer) {
        context.dispatch({ type: 'upsert-buffer', buffer: result.serverBuffer });
      }
      context.updateBanner('notice', favorite ? 'Marked as favorite' : 'Removed from favorites');
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to update favorite');
    }
  };

  const selectNetworkBuffer = (network: NetworkProfile) => {
    const buffer = context.conversation.findServerBuffer(network.id);
    if (buffer) {
      selectBuffer(context.dispatch, buffer);
    }
  };

  return {
    closeConnection,
    connectNetwork,
    deleteNetwork,
    disconnectNetwork,
    duplicateNetwork,
    openNetworkEditor: showExistingNetworkEditor,
    openNewNetworkEditor: showNewNetworkEditor,
    reconnectNetwork,
    saveFavorite,
    selectNetworkBuffer,
    submitNetwork,
  };
};

const createFriendActions = (context: AppActionContext) => {
  const selectPrivateBuffer = async (network: NetworkProfile, nick: string) => {
    try {
      await context.openOrSelectQueryBuffer(network, nick);
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const selectFriend = async (friend: FriendState) => {
    const decision = resolveFriendSelection({
      nick: friend.nick,
      buffers: context.state.buffers,
      workspace: context.workspace,
      networkStates: context.state.networkStates,
    });

    if (decision.type === 'error') {
      context.updateBanner('error', decision.message);
      return;
    }

    if (decision.type === 'select') {
      selectBuffer(context.dispatch, decision.buffer);
      return;
    }

    try {
      await context.openOrSelectQueryBuffer(decision.network, friend.nick);
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to open private message');
    }
  };

  const addFriend = async (nick: string) => {
    try {
      const result = await api.addFriend(nick);
      context.dispatch({ type: 'upsert-friend', friend: result.friend });
      context.updateBanner('notice', 'Friend saved');
      return true;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to save friend');
      return false;
    }
  };

  const removeFriend = async (friendId: string) => {
    try {
      await api.removeFriend(friendId);
      context.dispatch({ type: 'remove-friend', friendId });
      context.updateBanner('notice', 'Friend removed');
      return true;
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to remove friend');
      return false;
    }
  };

  return {
    addFriend,
    removeFriend,
    selectFriend,
    selectPrivateBuffer,
  };
};

const createChatActions = (context: AppActionContext) => {
  const selectTabBuffer = (buffer: BufferState) => selectBuffer(context.dispatch, buffer);
  const selectPendingTab = (networkId: string, channel: string) =>
    selectPendingChannel(context.dispatch, networkId, channel);

  const openMentionedChannel = async (channelName: string) => {
    const network = context.workspace.selectedNetwork;
    if (!network) {
      return;
    }
    context.joinChannel(network.id, channelName, context.workspace.selectedBuffer?.id);
  };

  const openChannelList = async () => {
    const network = context.workspace.selectedNetwork;
    if (!network) {
      return;
    }
    await context.openChannelListForNetwork(network.id);
  };

  const closeChannelList = () => {
    const networkId = context.state.channelList.networkId;
    if (networkId) {
      context.sendGatewayMessage({ type: 'channel.list.cancel', networkId }, false);
    }
    context.dispatch({ type: 'close-channel-list' });
  };

  const joinChannelFromList = async (channel: string) => {
    const networkId = context.state.channelList.networkId;
    if (!networkId) {
      return;
    }
    context.joinChannel(networkId, channel, context.conversation.findServerBuffer(networkId)?.id);
  };

  const closeChannel = (networkId: string, channel: string) => {
    const socket = context.getGatewaySocket();
    if (!socket) {
      return;
    }
    const buffer = context.conversation.findChannelBuffer(networkId, channel);
    try {
      socket.send({
        type: 'channel.part',
        networkId,
        channel,
        sourceBufferId: buffer?.id ?? context.workspace.selectedBuffer?.id,
      });
    } catch {
      context.updateBanner('error', gatewayReconnectMessage);
    }
  };

  const closeBuffer = async (buffer: BufferState) => {
    try {
      await api.closeBuffer(buffer.id);
      context.dispatch({ type: 'remove-buffer', networkId: buffer.networkId, bufferId: buffer.id });
    } catch (error) {
      context.updateBanner('error', error instanceof Error ? error.message : 'Failed to close private message');
    }
  };

  const sendComposer = async () => {
    if (context.draft.trim() && !context.getGatewaySocket()) {
      return;
    }
    try {
      const submitted = await sendComposerMessage({
        draft: context.draft,
        setDraft: context.setDraft,
        socket: context.getGatewaySocket(false),
        updateBanner: context.updateBanner,
        workspace: context.workspace,
        onJoinChannel: async (networkId, channel, sourceBufferId) => {
          context.joinChannel(networkId, channel, sourceBufferId);
        },
        onOpenChannelList: context.openChannelListForNetwork,
        onOpenQuery: async (networkId, nick) => {
          const network = context.state.networks.find((candidate) => candidate.id === networkId) ?? null;
          if (!network) {
            throw new Error('Network not found');
          }
          await context.openOrSelectQueryBuffer(network, nick);
        },
      });
      if (submitted) {
        context.recordComposerEntry(submitted);
      }
    } catch (error) {
      context.updateBanner('error', toGatewayErrorMessage(error, 'Failed to send message'));
    }
  };

  return {
    closeBuffer,
    closeChannel,
    closeChannelList,
    joinChannelFromList,
    openChannelList,
    openMentionedChannel,
    selectPendingTab,
    selectTabBuffer,
    sendComposer,
  };
};

export function useAppActions(params: AppActionParams) {
  const conversation = createConversationQueries(params.state);
  const gateway = createGatewayHelpers(params);
  const helpers = createConversationHelpers(
    params,
    conversation,
    gateway.sendGatewayMessage,
    gateway.getGatewaySocket
  );
  const context: AppActionContext = {
    ...params,
    ...gateway,
    ...helpers,
    conversation,
  };

  return {
    ...createNetworkActions(context),
    ...createFriendActions(context),
    ...createChatActions(context),
  };
}
