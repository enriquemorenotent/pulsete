import type {
  BufferHistoryImportRequest,
  BufferHistoryImportSummary,
  BufferState,
  NetworkProfile,
} from '../../shared/protocol.js';
import { isChannelListLoadingForNetwork } from './app-state-channel-list.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import {
  type AppActionContext,
  selectBuffer,
  selectPendingChannel,
  type ConversationActions,
  type GatewayActions,
} from './app-actions-types.js';

type ConversationActionParams = Pick<
  AppActionContext,
  'applyServerMessages' | 'dispatch' | 'getSession' | 'updateBanner'
> & GatewayActions;

export const createConversationActions = ({
  applyServerMessages,
  dispatch,
  getSession,
  updateBanner,
  getGatewaySocket,
  sendGatewayMessage,
}: ConversationActionParams): ConversationActions => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const joinChannel = (networkId: string, channel: string, sourceBufferId?: string) => {
    const { conversation, state } = getSession();
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

  const openOrSelectQueryBuffer = async (network: NetworkProfile, nick: string): Promise<BufferState> => {
    const { conversation } = getSession();
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
    const { state } = getSession();
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

  const clearBufferHistory = async (bufferId: string) =>
    executeMutation({
      request: () => api.clearBufferHistory(bufferId),
      onSuccess: () => {
        dispatch({ type: 'history-buffer-loaded', bufferId, hasOlder: false });
      },
      mapResult: () => true,
      successMessage: null,
      errorMessage: 'Failed to clear chat history',
      failureValue: false,
    });

  const downloadBufferHistory = async (bufferId: string) => {
    try {
      await api.downloadBufferHistory(bufferId);
      return true;
    } catch (error) {
      updateBanner('error', error instanceof Error ? error.message : 'Failed to download chat history');
      return false;
    }
  };

  const importBufferHistory = async (bufferId: string, input: BufferHistoryImportRequest) =>
    executeMutation({
      request: () => api.importBufferHistory(bufferId, input),
      mapResult: () => true,
      successMessage: ({ summary }) => formatHistoryImportNotice(summary),
      errorMessage: 'Failed to import chat history',
      failureValue: false,
    });

  return {
    clearBufferHistory,
    downloadBufferHistory,
    importBufferHistory,
    joinChannel,
    openOrSelectQueryBuffer,
    openChannelListForNetwork,
  };
};

const formatHistoryImportNotice = (summary: BufferHistoryImportSummary) => {
  const details = [];
  if (summary.duplicateCount > 0) {
    details.push(`${summary.duplicateCount} duplicates skipped`);
  }
  if (summary.skippedCount > 0) {
    details.push(`${summary.skippedCount} non-matching lines skipped`);
  }
  const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
  return `Imported ${summary.importedCount} ${summary.importedCount === 1 ? 'message' : 'messages'} from ${summary.format} logs${suffix}.`;
};
