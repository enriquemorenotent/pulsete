import type { BufferState } from '../../shared/protocol.js';
import {
  type AppActionContext,
  selectBuffer,
  selectPendingChannel,
  type ConversationActions,
  type GatewayActions,
} from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import { sendComposerMessage } from './composer-actions.js';
import { gatewayReconnectMessage, toGatewayErrorMessage } from './gateway.js';

type ChatActionParams = Pick<
  AppActionContext,
  | 'applyServerMessages'
  | 'dispatch'
  | 'getSession'
  | 'recordComposerEntry'
  | 'setDraft'
  | 'updateBanner'
> &
  ConversationActions &
  GatewayActions;

export const createChatActions = ({
  clearBufferHistory,
  downloadBufferHistory,
  importBufferHistory,
  updateBufferSelfNickAliases,
  applyServerMessages,
  dispatch,
  getSession,
  getGatewaySocket,
  joinChannel,
  openChannelListForNetwork,
  openOrSelectQueryBuffer,
  recordComposerEntry,
  sendGatewayMessage,
  setDraft,
  updateBanner,
}: ChatActionParams) => {
  const executeMutation = createAppMutationExecutor({
    applyServerMessages,
    updateBanner,
  });
  const selectTabBuffer = (buffer: BufferState) =>
    selectBuffer(dispatch, buffer);
  const selectPendingTab = (networkId: string, channel: string) =>
    selectPendingChannel(dispatch, networkId, channel);

  const openMentionedChannel = async (channelName: string) => {
    const { workspace } = getSession();
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    joinChannel(network.id, channelName, workspace.selectedBuffer?.id);
  };

  const openChannelList = async () => {
    const { workspace } = getSession();
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    await openChannelListForNetwork(network.id);
  };

  const closeChannelList = () => {
    const { state } = getSession();
    const channelList = state.transient.channelList;
    const networkId = channelList.networkId;
    if (networkId) {
      sendGatewayMessage({ type: 'channel.list.cancel', networkId }, false);
    }
    dispatch({ type: 'close-channel-list' });
  };

  const joinChannelFromList = async (channel: string) => {
    const { conversation, state } = getSession();
    const channelList = state.transient.channelList;
    const networkId = channelList.networkId;
    if (!networkId) {
      return;
    }
    joinChannel(
      networkId,
      channel,
      conversation.findServerBuffer(networkId)?.id,
    );
  };

  const closeChannel = (networkId: string, channel: string) => {
    const socket = getGatewaySocket();
    if (!socket) {
      return;
    }
    const { conversation, workspace } = getSession();
    const buffer = conversation.findChannelBuffer(networkId, channel);
    try {
      socket.send({
        type: 'channel.part',
        networkId,
        channel,
        sourceBufferId: buffer?.id ?? workspace.selectedBuffer?.id,
      });
    } catch {
      updateBanner('error', gatewayReconnectMessage);
    }
  };

  const closeBuffer = async (buffer: BufferState) => {
    await executeMutation({
      request: () => api.closeBuffer(buffer.id),
      errorMessage: 'Failed to close private message',
      failureValue: undefined,
    });
  };

  const sendComposer = async () => {
    const { draft, workspace } = getSession();
    const draftBufferId = workspace.selectedBuffer?.id ?? null;
    if (draft.trim() && !getGatewaySocket()) {
      return false;
    }
    return executeMutation({
      request: () =>
        sendComposerMessage({
          draft,
          setDraft: (value) => setDraft(value, draftBufferId),
          socket: getGatewaySocket(false),
          updateBanner,
          workspace,
          onJoinChannel: async (networkId, channel, sourceBufferId) => {
            joinChannel(networkId, channel, sourceBufferId);
          },
          onOpenChannelList: openChannelListForNetwork,
          onOpenQuery: async (networkId, nick) => {
            const { state } = getSession();
            const networks = state.domain.networks;
            const network =
              networks.find((candidate) => candidate.id === networkId) ?? null;
            if (!network) {
              throw new Error('Network not found');
            }
            await openOrSelectQueryBuffer(network, nick);
          },
        }),
      mapResult: (submitted) => {
        if (submitted) {
          recordComposerEntry(submitted, draftBufferId);
        }
        return Boolean(submitted);
      },
      errorMessage: 'Failed to send message',
      formatError: toGatewayErrorMessage,
      failureValue: false,
    });
  };

  return {
    clearBufferHistory,
    closeBuffer,
    closeChannel,
    closeChannelList,
    downloadBufferHistory,
    importBufferHistory,
    updateBufferSelfNickAliases,
    joinChannelFromList,
    openChannelList,
    openMentionedChannel,
    selectPendingTab,
    selectTabBuffer,
    sendComposer,
  };
};
