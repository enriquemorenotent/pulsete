import type { AppActionContext } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';

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

  const saveNickEmoji = async (
    networkId: string,
    nick: string,
    emoji: string | null,
    identity?: NetworkUserIdentity | null,
  ) => {
    return executeMutation({
      request: () => api.saveNickEmoji(networkId, nick, emoji, identity),
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
