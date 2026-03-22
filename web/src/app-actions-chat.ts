import type { BufferState } from '../../shared/protocol.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import type { ConversationIndex } from './conversation-selectors.js';
import {
  selectBuffer,
  selectPendingChannel,
  type AppDispatch,
  type BannerActions,
  type ConversationActions,
  type DraftActions,
  type GatewayActions,
  type WorkspaceActions,
} from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import { sendComposerMessage } from './composer-actions.js';
import { gatewayReconnectMessage, toGatewayErrorMessage } from './gateway.js';

type ChatActionParams = BannerActions & ConversationActions & DraftActions & GatewayActions & WorkspaceActions & {
  channelList: AppTransientState['channelList'];
  conversation: ConversationIndex;
  dispatch: AppDispatch;
  gatewayStatus: AppDomainState['gatewayStatus'];
  networks: AppDomainState['networks'];
};

export const createChatActions = ({
  channelList,
  conversation,
  dispatch,
  draft,
  gatewayStatus,
  getGatewaySocket,
  joinChannel,
  networks,
  openChannelListForNetwork,
  openOrSelectQueryBuffer,
  recordComposerEntry,
  sendGatewayMessage,
  setDraft,
  updateBanner,
  workspace,
}: ChatActionParams) => {
  const executeMutation = createAppMutationExecutor({ dispatch, gatewayStatus, updateBanner });
  const selectTabBuffer = (buffer: BufferState) => selectBuffer(dispatch, buffer);
  const selectPendingTab = (networkId: string, channel: string) =>
    selectPendingChannel(dispatch, networkId, channel);

  const openMentionedChannel = async (channelName: string) => {
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    joinChannel(network.id, channelName, workspace.selectedBuffer?.id);
  };

  const openChannelList = async () => {
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    await openChannelListForNetwork(network.id);
  };

  const closeChannelList = () => {
    const networkId = channelList.networkId;
    if (networkId) {
      sendGatewayMessage({ type: 'channel.list.cancel', networkId }, false);
    }
    dispatch({ type: 'close-channel-list' });
  };

  const joinChannelFromList = async (channel: string) => {
    const networkId = channelList.networkId;
    if (!networkId) {
      return;
    }
    joinChannel(networkId, channel, conversation.findServerBuffer(networkId)?.id);
  };

  const closeChannel = (networkId: string, channel: string) => {
    const socket = getGatewaySocket();
    if (!socket) {
      return;
    }
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
    if (draft.trim() && !getGatewaySocket()) {
      return;
    }
    await executeMutation({
      request: () => sendComposerMessage({
        draft,
        setDraft,
        socket: getGatewaySocket(false),
        updateBanner,
        workspace,
        onJoinChannel: async (networkId, channel, sourceBufferId) => {
          joinChannel(networkId, channel, sourceBufferId);
        },
        onOpenChannelList: openChannelListForNetwork,
        onOpenQuery: async (networkId, nick) => {
          const network = networks.find((candidate) => candidate.id === networkId) ?? null;
          if (!network) {
            throw new Error('Network not found');
          }
          await openOrSelectQueryBuffer(network, nick);
        },
      }),
      onSuccess: (submitted) => {
        if (submitted) {
          recordComposerEntry(submitted);
        }
      },
      errorMessage: 'Failed to send message',
      formatError: toGatewayErrorMessage,
      failureValue: undefined,
    });
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
