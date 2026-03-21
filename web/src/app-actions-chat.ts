import type { BufferState } from '../../shared/protocol.js';
import { selectBuffer, selectPendingChannel, type AppActionContext } from './app-actions-types.js';
import { api } from './client.js';
import { sendComposerMessage } from './composer-actions.js';
import { gatewayReconnectMessage, toGatewayErrorMessage } from './gateway.js';

export const createChatActions = (context: AppActionContext) => {
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
