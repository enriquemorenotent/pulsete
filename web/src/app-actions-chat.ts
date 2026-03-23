import type { BufferState } from '../../shared/protocol.js';
import {
  selectBuffer,
  selectPendingChannel,
  type AppSessionReader,
  type AppDispatch,
  type BannerActions,
  type ConversationActions,
  type DraftActions,
  type GatewayActions,
} from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import { sendComposerMessage } from './composer-actions.js';
import { gatewayReconnectMessage, toGatewayErrorMessage } from './gateway.js';

type ChatActionParams = BannerActions
  & ConversationActions
  & Pick<DraftActions, 'recordComposerEntry' | 'setDraft'>
  & GatewayActions
  & {
  dispatch: AppDispatch;
  readState: AppSessionReader;
};

export const createChatActions = ({
  dispatch,
  readState,
  getGatewaySocket,
  joinChannel,
  openChannelListForNetwork,
  openOrSelectQueryBuffer,
  recordComposerEntry,
  sendGatewayMessage,
  setDraft,
  updateBanner,
}: ChatActionParams) => {
  const executeMutation = createAppMutationExecutor({ dispatch, readState, updateBanner });
  const selectTabBuffer = (buffer: BufferState) => selectBuffer(dispatch, buffer);
  const selectPendingTab = (networkId: string, channel: string) =>
    selectPendingChannel(dispatch, networkId, channel);

  const openMentionedChannel = async (channelName: string) => {
    const { workspace } = readState().model;
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    joinChannel(network.id, channelName, workspace.selectedBuffer?.id);
  };

  const openChannelList = async () => {
    const { workspace } = readState().model;
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    await openChannelListForNetwork(network.id);
  };

  const closeChannelList = () => {
    const { channelList } = readState().state.transient;
    const networkId = channelList.networkId;
    if (networkId) {
      sendGatewayMessage({ type: 'channel.list.cancel', networkId }, false);
    }
    dispatch({ type: 'close-channel-list' });
  };

  const joinChannelFromList = async (channel: string) => {
    const { channelList } = readState().state.transient;
    const { conversation } = readState().model;
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
    const { conversation, workspace } = readState().model;
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
    const { draft } = readState();
    if (draft.trim() && !getGatewaySocket()) {
      return;
    }
    await executeMutation({
      request: () => sendComposerMessage({
        draft,
        setDraft,
        socket: getGatewaySocket(false),
        updateBanner,
        workspace: readState().model.workspace,
        onJoinChannel: async (networkId, channel, sourceBufferId) => {
          joinChannel(networkId, channel, sourceBufferId);
        },
        onOpenChannelList: openChannelListForNetwork,
        onOpenQuery: async (networkId, nick) => {
          const { networks } = readState().state.domain;
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
