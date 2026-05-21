import type { BufferState, NetworkProfile } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { isChannelListLoadingForNetwork } from './app-state-channel-list.js';
import { api } from './client.js';
import { createAppMutationExecutor } from './app-mutation.js';
import {
  type AppActionContext,
  getConversation,
  selectBuffer,
  selectPendingChannel,
  type ConversationActions,
  type GatewayActions,
} from './app-actions-types.js';

type ConversationActionParams = Pick<
  AppActionContext,
  'applyServerMessages' | 'dispatch' | 'getState' | 'updateBanner'
> & GatewayActions;

export const createConversationActions = ({
  applyServerMessages,
  dispatch,
  getState,
  updateBanner,
  getGatewaySocket,
  sendGatewayMessage,
}: ConversationActionParams): ConversationActions => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const joinChannel = (networkId: string, channel: string, sourceBufferId?: string) => {
    const state = getState();
    const conversation = getConversation(getState);
    const existingBuffer = conversation.findChannelBuffer(networkId, channel);
    if (existingBuffer) {
      selectBuffer(dispatch, existingBuffer);
      return true;
    }

    if (conversation.findPendingChannel(networkId, channel)) {
      selectPendingChannel(dispatch, networkId, channel);
      return true;
    }

    const runtime = state.domain.networkStates[networkId] ?? null;
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

  const openOrSelectQueryBuffer = async (
    network: NetworkProfile,
    nick: string,
    peerIdentity?: NetworkUserIdentity | null,
  ): Promise<BufferState> => {
    const conversation = getConversation(getState);
    const existingBuffer = conversation.findQueryBuffer(network.id, nick);
    if (existingBuffer && !peerIdentity) {
      selectBuffer(dispatch, existingBuffer);
      return existingBuffer;
    }
    const result = await api.openQuery(network.id, nick, peerIdentity);
    applyServerMessages(result.messages);
    selectBuffer(dispatch, result.buffer);
    return result.buffer;
  };

  const openChannelListForNetwork = async (networkId: string) => {
    if (!getGatewaySocket()) {
      return;
    }
    const state = getState();
    const channelList = state.transient.channelList;
    const runtime = state.domain.networkStates[networkId] ?? null;
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

  const downloadBufferHistory = async (bufferId: string) => {
    try {
      await api.downloadBufferHistory(bufferId);
      return true;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to download chat history');
      return false;
    }
  };

  const clearBufferHistory = async (buffer: BufferState) =>
    executeMutation({
      request: () => api.clearBufferHistory(buffer.id),
      mapResult: () => true,
      successMessage: 'Private-message history deleted',
      errorMessage: 'Failed to delete private-message history',
      failureValue: false,
    });

  const searchBufferHistory = (
    bufferId: string,
    query: string,
    init?: Pick<RequestInit, 'signal'>,
  ) => api.searchBufferHistory(bufferId, query, undefined, init);

  const searchLogs: ConversationActions['searchLogs'] = (
    query,
    filters,
    init,
  ) => api.searchLogs(query, filters, undefined, init);

  const listLogSources: ConversationActions['listLogSources'] = (
    filters,
    init,
  ) => api.listLogSources(filters, undefined, init);

  const loadBufferHistory: ConversationActions['loadBufferHistory'] = (
    bufferId,
    beforeMessageId,
    init,
  ) => api.loadHistory(bufferId, undefined, beforeMessageId, init);

  const saveBufferNotes = async (buffer: BufferState, notes: string) =>
    executeMutation({
      request: () => api.saveBufferNotes(buffer.id, notes),
      mapResult: (result) => result.buffer,
      successMessage: null,
      errorMessage: 'Failed to save notes',
      failureValue: null,
    });

  return {
    clearBufferHistory,
    downloadBufferHistory,
    joinChannel,
    openOrSelectQueryBuffer,
    openChannelListForNetwork,
    listLogSources,
    loadBufferHistory,
    saveBufferNotes,
    searchBufferHistory,
    searchLogs,
  };
};
