import type { BufferState, NetworkProfile } from '../../shared/protocol.js';
import { isChannelListLoadingForNetwork } from './app-state-channel-list.js';
import { api } from './client.js';
import {
  type ApplyServerMessages,
  type ChannelListReader,
  type ConversationReader,
  selectBuffer,
  selectPendingChannel,
  type AppDispatch,
  type BannerActions,
  type ConversationActions,
  type GatewayActions,
  type NetworkStatesReader,
} from './app-actions-types.js';

type ConversationActionParams = {
  applyServerMessages: ApplyServerMessages;
  dispatch: AppDispatch;
  readChannelList: ChannelListReader;
  readConversation: ConversationReader;
  readNetworkStates: NetworkStatesReader;
} & BannerActions & GatewayActions;

export const createConversationActions = ({
  applyServerMessages,
  dispatch,
  readChannelList,
  readConversation,
  readNetworkStates,
  updateBanner,
  getGatewaySocket,
  sendGatewayMessage,
}: ConversationActionParams): ConversationActions => {
  const joinChannel = (networkId: string, channel: string, sourceBufferId?: string) => {
    const conversation = readConversation();
    const networkStates = readNetworkStates();
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
    const conversation = readConversation();
    const existingBuffer = conversation.findQueryBuffer(network.id, nick);
    if (existingBuffer) {
      selectBuffer(dispatch, existingBuffer);
      return existingBuffer;
    }
    const result = await api.openQuery(network.id, nick);
    applyServerMessages(result.messages);
    selectBuffer(dispatch, result.buffer);
    return result.buffer;
  };

  const openChannelListForNetwork = async (networkId: string) => {
    if (!getGatewaySocket()) {
      return;
    }
    const channelList = readChannelList();
    const networkStates = readNetworkStates();
    const runtime = networkStates[networkId] ?? null;
    if (runtime?.phase !== 'connected') {
      updateBanner('error', 'Connect the network before listing channels');
      return;
    }
    if (isChannelListLoadingForNetwork(channelList, networkId)) {
      return;
    }
    if (!sendGatewayMessage({ type: 'channel.list.request', networkId })) {
      return;
    }
    dispatch({ type: 'open-channel-list', networkId });
  };

  return { joinChannel, openOrSelectQueryBuffer, openChannelListForNetwork };
};
