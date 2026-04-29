import type { AppActionContext } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';

type NickEmojiActionParams = Pick<
  AppActionContext,
  | 'applyServerMessages'
  | 'updateBanner'
>;

export const createNickEmojiActions = ({
  applyServerMessages,
  updateBanner,
}: NickEmojiActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const saveNickEmoji = async (networkId: string, nick: string, emoji: string | null) => {
    return executeMutation({
      request: () => api.saveNickEmoji(networkId, nick, emoji),
      mapResult: () => true,
      successMessage: null,
      errorMessage: 'Failed to update nick emoji',
      failureValue: false,
    });
  };

  return {
    saveNickEmoji,
  };
};
