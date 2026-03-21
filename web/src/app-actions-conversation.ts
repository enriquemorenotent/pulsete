import type { BufferState, NetworkProfile } from '../../shared/protocol.js';
import { createConversationQueries } from './conversation-selectors.js';
import { api } from './client.js';
import {
  selectBuffer,
  selectPendingChannel,
  type AppActionParams,
  type ConversationActions,
  type GatewayActions,
} from './app-actions-types.js';

type ConversationActionParams = {
  params: AppActionParams;
  conversation: ReturnType<typeof createConversationQueries>;
} & GatewayActions;

export const createConversationActions = ({
  params,
  conversation,
  getGatewaySocket,
  sendGatewayMessage,
}: ConversationActionParams): ConversationActions => {
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

  const openOrSelectQueryBuffer = async (network: NetworkProfile, nick: string): Promise<BufferState> => {
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
