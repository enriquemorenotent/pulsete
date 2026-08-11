import { api } from './client.js';
import { createAppMutationExecutor } from './app-mutation.js';
import type { AppActionContext } from './app-actions-types.js';

type MessagePinActionParams = Pick<
  AppActionContext,
  'applyServerMessages' | 'dispatch' | 'getState' | 'updateBanner'
>;

let nextMessageFocusRequestId = 1;

export const createMessagePinActions = ({
  applyServerMessages,
  dispatch,
  getState,
  updateBanner,
}: MessagePinActionParams) => {
  const executeMutation = createAppMutationExecutor({
    applyServerMessages,
    updateBanner,
  });

  const loadPinnedMessages = async (bufferId: string) => {
    try {
      const payload = await api.loadPinnedMessages(bufferId);
      dispatch({ type: 'set-pinned-messages', bufferId, messages: payload.messages });
      return true;
    } catch (error) {
      updateBanner('error', toErrorMessage(error, 'Failed to load pinned messages'));
      return false;
    }
  };

  const setMessagePinned = (bufferId: string, messageId: string, pinned: boolean) =>
    executeMutation({
      request: () => api.setMessagePinned(bufferId, messageId, pinned),
      errorMessage: pinned ? 'Failed to pin message' : 'Failed to unpin message',
      failureValue: false,
      mapResult: () => true,
    });

  const jumpToPinnedMessage = async (bufferId: string, messageId: string) => {
    try {
      const payload = await api.loadPinnedMessageHistoryWindow(bufferId, messageId);
      const selection = getState().transient.selection;
      const selectedBufferId = selection?.kind === 'buffer'
        ? selection.bufferId
        : null;
      if (selectedBufferId !== bufferId) {
        return false;
      }
      dispatch({
        type: 'replace-message-window',
        bufferId,
        messages: payload.messages,
        hasOlder: payload.hasOlder,
        hasNewer: payload.hasNewer,
        focusMessageId: payload.targetMessageId,
        focusRequestId: nextMessageFocusRequestId++,
      });
      return true;
    } catch (error) {
      updateBanner('error', toErrorMessage(error, 'Failed to open pinned message'));
      return false;
    }
  };

  const returnBufferToLatest = async (bufferId: string) => {
    try {
      const payload = await api.loadHistory(bufferId);
      const selection = getState().transient.selection;
      const selectedBufferId = selection?.kind === 'buffer'
        ? selection.bufferId
        : null;
      if (selectedBufferId !== bufferId) {
        return false;
      }
      dispatch({
        type: 'replace-message-window',
        bufferId,
        messages: payload.messages,
        hasOlder: payload.hasMore,
        hasNewer: false,
      });
      return true;
    } catch (error) {
      updateBanner('error', toErrorMessage(error, 'Failed to return to latest messages'));
      return false;
    }
  };

  return {
    jumpToPinnedMessage,
    loadPinnedMessages,
    returnBufferToLatest,
    setMessagePinned,
  };
};

const toErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;
