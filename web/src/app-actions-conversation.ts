import type { BufferState, NetworkProfile } from '../../shared/protocol.js';
import type { AppSessionReader } from './app-actions-types.js';
import { isChannelListLoadingForNetwork } from './app-state-channel-list.js';
import { api } from './client.js';
import {
  selectBuffer,
  selectPendingChannel,
  type AppDispatch,
  type BannerActions,
  type ConversationActions,
  type GatewayActions,
} from './app-actions-types.js';
import { syncMutationMessages } from './mutation-message-sync.js';

type ConversationActionParams = {
  dispatch: AppDispatch;
  readState: AppSessionReader;
} & BannerActions & GatewayActions;

export const createConversationActions = ({
  dispatch,
  readState,
  updateBanner,
  getGatewaySocket,
  sendGatewayMessage,
}: ConversationActionParams): ConversationActions => {
  const joinChannel = (networkId: string, channel: string, sourceBufferId?: string) => {
    const { conversation } = readState().model;
    const { networkStates } = readState().state.domain;
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
    const { conversation } = readState().model;
    const { gatewayStatus } = readState().state.domain;
    const existingBuffer = conversation.findQueryBuffer(network.id, nick);
    if (existingBuffer) {
      selectBuffer(dispatch, existingBuffer);
      return existingBuffer;
    }
    const result = await api.openQuery(network.id, nick);
    syncMutationMessages(gatewayStatus, result.messages, dispatch);
    selectBuffer(dispatch, result.buffer);
    return result.buffer;
  };

  const openChannelListForNetwork = async (networkId: string) => {
    if (!getGatewaySocket()) {
      return;
    }
    const { channelList } = readState().state.transient;
    const { networkStates } = readState().state.domain;
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
