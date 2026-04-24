import type { BufferState } from '../../shared/protocol.js';
import {
  type AppActionContext,
  readConversation,
  readWorkspace,
  selectBuffer,
  selectPendingChannel,
  type ConversationActions,
  type GatewayActions,
} from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import { sendComposerMessage } from './composer-actions.js';
import { toGatewayErrorMessage } from './gateway.js';

type ChatActionParams = Pick<
  AppActionContext,
  | 'applyServerMessages'
  | 'dispatch'
  | 'getConversation'
  | 'getDraft'
  | 'getState'
  | 'getWorkspace'
  | 'recordComposerEntry'
  | 'setDraft'
  | 'updateBanner'
> &
  ConversationActions &
  GatewayActions;

export const createChatActions = ({
  downloadBufferHistory,
  applyServerMessages,
  dispatch,
  getConversation,
  getDraft,
  getState,
  getWorkspace,
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
    const workspace = readWorkspace(getState, getWorkspace);
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    joinChannel(network.id, channelName, workspace.selectedBuffer?.id);
  };

  const openChannelList = async () => {
    const workspace = readWorkspace(getState, getWorkspace);
    const network = workspace.selectedNetwork;
    if (!network) {
      return;
    }
    await openChannelListForNetwork(network.id);
  };

  const closeChannelList = () => {
    const state = getState();
    const channelList = state.transient.channelList;
    const networkId = channelList.networkId;
    if (networkId) {
      sendGatewayMessage({ type: 'channel.list.cancel', networkId }, false);
    }
    dispatch({ type: 'close-channel-list' });
  };

  const joinChannelFromList = async (channel: string) => {
    const state = getState();
    const conversation = readConversation(getState, getConversation);
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

  const closeConversationBuffer = async (buffer: BufferState, errorMessage: string) => {
    await executeMutation({
      request: () => api.closeBuffer(buffer.id),
      errorMessage,
      failureValue: undefined,
    });
  };

  const closeChannel = async (networkId: string, channel: string) => {
    const conversation = readConversation(getState, getConversation);
    const buffer = conversation.findChannelBuffer(networkId, channel);
    if (!buffer) {
      return;
    }
    await closeConversationBuffer(buffer, 'Failed to close channel');
  };

  const closeBuffer = async (buffer: BufferState) => {
    await closeConversationBuffer(buffer, 'Failed to close private message');
  };

  const sendComposer = async () => {
    const workspace = readWorkspace(getState, getWorkspace);
    const draftBufferId = workspace.selectedBuffer?.id ?? null;
    const draft = getDraft(draftBufferId);
    if (draft.trim() && !isLocalCloseCommand(draft) && !getGatewaySocket()) {
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
            const state = getState();
            const networks = state.domain.networks;
            const network =
              networks.find((candidate) => candidate.id === networkId) ?? null;
            if (!network) {
              throw new Error('Network not found');
            }
            await openOrSelectQueryBuffer(network, nick);
          },
          onCloseChannel: closeChannel,
          onCloseBuffer: closeBuffer,
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

  const requestWhois = (networkId: string, nick: string, sourceBufferId?: string) =>
    sendGatewayMessage({
      type: 'raw.send',
      networkId,
      raw: `WHOIS ${nick}`,
      sourceBufferId,
    });

  return {
    closeBuffer,
    closeChannel,
    closeChannelList,
    downloadBufferHistory,
    joinChannelFromList,
    openChannelList,
    openMentionedChannel,
    requestWhois,
    selectPendingTab,
    selectTabBuffer,
    sendComposer,
  };
};

const isLocalCloseCommand = (draft: string) => /^\/close(?:\s|$)/i.test(draft.trim());
