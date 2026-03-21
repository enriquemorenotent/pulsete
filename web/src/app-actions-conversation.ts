import type { BufferState, NetworkProfile } from '../../shared/protocol.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import type { ConversationIndex } from './conversation-selectors.js';
import { api } from './client.js';
import {
  selectBuffer,
  selectPendingChannel,
  type AppDispatch,
  type BannerActions,
  type ConversationActions,
  type GatewayActions,
} from './app-actions-types.js';

type ConversationActionParams = {
  dispatch: AppDispatch;
  networkStates: AppDomainState['networkStates'];
  channelList: AppTransientState['channelList'];
  conversation: ConversationIndex;
} & BannerActions & GatewayActions;

export const createConversationActions = ({
  dispatch,
  networkStates,
  channelList,
  updateBanner,
  conversation,
  getGatewaySocket,
  sendGatewayMessage,
}: ConversationActionParams): ConversationActions => {
  const joinChannel = (networkId: string, channel: string, sourceBufferId?: string) => {
    const existingBuffer = conversation.findChannelBuffer(networkId, channel);
    if (existingBuffer) {
      selectBuffer(dispatch, existingBuffer);
      return true;
    }

    if (conversation.findPendingChannel(networkId, channel)) {
      selectPendingChannel(dispatch, networkId, channel);
      return true;
    }

    const runtime = networkStates[networkId] ?? null;
    if (runtime?.phase !== 'connected') {
      updateBanner('error', `Connect first to join ${channel}`);
      return false;
    }

    if (!sendGatewayMessage({ type: 'channel.join', networkId, channel, sourceBufferId })) {
      return false;
    }

    selectPendingChannel(dispatch, networkId, channel);
    return true;
  };

  const openOrSelectQueryBuffer = async (network: NetworkProfile, nick: string): Promise<BufferState> => {
    const existingBuffer = conversation.findQueryBuffer(network.id, nick);
    if (existingBuffer) {
      selectBuffer(dispatch, existingBuffer);
      return existingBuffer;
    }
    const result = await api.openQuery(network.id, nick);
    dispatch({ type: 'upsert-buffer', buffer: result.buffer });
    selectBuffer(dispatch, result.buffer);
    return result.buffer;
  };

  const openChannelListForNetwork = async (networkId: string) => {
    if (!getGatewaySocket()) {
      return;
    }
    const runtime = networkStates[networkId] ?? null;
    if (runtime?.phase !== 'connected') {
      updateBanner('error', 'Connect the network before listing channels');
      return;
    }
    if (
      channelList.open
      && channelList.networkId === networkId
      && channelList.status === 'loading'
    ) {
      return;
    }
    if (!sendGatewayMessage({ type: 'channel.list.request', networkId })) {
      return;
    }
    dispatch({ type: 'open-channel-list', networkId });
  };

  return { joinChannel, openOrSelectQueryBuffer, openChannelListForNetwork };
};
