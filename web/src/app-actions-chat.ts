import type { BufferState } from '../../shared/protocol.js';
import {
  type ApplyServerMessages,
  type ChannelListReader,
  type ConversationReader,
  type DraftReader,
  type NetworksReader,
  selectBuffer,
  selectPendingChannel,
  type WorkspaceReader,
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
  applyServerMessages: ApplyServerMessages;
  dispatch: AppDispatch;
  readChannelList: ChannelListReader;
  readConversation: ConversationReader;
  readDraft: DraftReader;
  readNetworks: NetworksReader;
  readWorkspace: WorkspaceReader;
};

export const createChatActions = ({
  applyServerMessages,
  dispatch,
  readChannelList,
  readConversation,
  readDraft,
  readNetworks,
  readWorkspace,
  getGatewaySocket,
  joinChannel,
  openChannelListForNetwork,
  openOrSelectQueryBuffer,
  recordComposerEntry,
  sendGatewayMessage,
  setDraft,
  updateBanner,
}: ChatActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });
  const selectTabBuffer = (buffer: BufferState) => selectBuffer(dispatch, buffer);
  const selectPendingTab = (networkId: string, channel: string) =>
    selectPendingChannel(dispatch, networkId, channel);

  const openMentionedChannel = async (channelName: string) => {
    const network = readWorkspace().selectedNetwork;
    if (!network) {
      return;
    }
    joinChannel(network.id, channelName, readWorkspace().selectedBuffer?.id);
  };

  const openChannelList = async () => {
    const network = readWorkspace().selectedNetwork;
    if (!network) {
      return;
    }
    await openChannelListForNetwork(network.id);
  };

  const closeChannelList = () => {
    const channelList = readChannelList();
    const networkId = channelList.networkId;
    if (networkId) {
      sendGatewayMessage({ type: 'channel.list.cancel', networkId }, false);
    }
    dispatch({ type: 'close-channel-list' });
  };

  const joinChannelFromList = async (channel: string) => {
    const channelList = readChannelList();
    const conversation = readConversation();
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
    const conversation = readConversation();
    const workspace = readWorkspace();
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
    const draft = readDraft();
    if (draft.trim() && !getGatewaySocket()) {
      return;
    }
    await executeMutation({
      request: () => sendComposerMessage({
        draft,
        setDraft,
        socket: getGatewaySocket(false),
        updateBanner,
        workspace: readWorkspace(),
        onJoinChannel: async (networkId, channel, sourceBufferId) => {
          joinChannel(networkId, channel, sourceBufferId);
        },
        onOpenChannelList: openChannelListForNetwork,
        onOpenQuery: async (networkId, nick) => {
          const networks = readNetworks();
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
