import type {
  BufferHistoryImportRequest,
  BufferHistoryImportSummary,
  BufferSelfNickAliasesRequest,
  BufferState,
  NetworkProfile,
} from '../../shared/protocol.js';
import { isChannelListLoadingForNetwork } from './app-state-channel-list.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
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

  const openOrSelectQueryBuffer = async (network: NetworkProfile, nick: string): Promise<BufferState> => {
    const conversation = getConversation(getState);
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

  const importBufferHistory = async (bufferId: string, input: BufferHistoryImportRequest) =>
    executeMutation({
      request: () => api.importBufferHistory(bufferId, input),
      mapResult: () => true,
      successMessage: ({ summary }) => formatHistoryImportNotice(summary),
      errorMessage: 'Failed to import chat history',
      failureValue: false,
    });

  const updateBufferSelfNickAliases = async (bufferId: string, input: BufferSelfNickAliasesRequest) =>
    executeMutation({
      request: () => api.updateBufferSelfNickAliases(bufferId, input),
      mapResult: () => true,
      successMessage: ({ repairedCount }) =>
        repairedCount > 0
          ? `Updated self aliases and repaired ${repairedCount} ${repairedCount === 1 ? 'message' : 'messages'}.`
          : 'Updated self aliases.',
      errorMessage: 'Failed to update self aliases',
      failureValue: false,
    });

  return {
    downloadBufferHistory,
    importBufferHistory,
    updateBufferSelfNickAliases,
    joinChannel,
    openOrSelectQueryBuffer,
    openChannelListForNetwork,
  };
};

const formatHistoryImportNotice = (summary: BufferHistoryImportSummary) => {
  const details = [];
  if (summary.duplicateCount > 0) {
    details.push(`${summary.duplicateCount} existing ${summary.duplicateCount === 1 ? 'line' : 'lines'} skipped`);
  }
  if (summary.skippedCount > 0) {
    details.push(`${summary.skippedCount} non-matching lines skipped`);
  }
  const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
  return `Imported ${summary.importedCount} ${summary.importedCount === 1 ? 'message' : 'messages'} from ${summary.format} logs${suffix}.`;
};
