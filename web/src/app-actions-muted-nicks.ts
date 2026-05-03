import type { AppActionContext } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';

type MutedNickActionParams = Pick<
  AppActionContext,
  'applyServerMessages' | 'updateBanner'
>;

export const createMutedNickActions = ({
  applyServerMessages,
  updateBanner,
}: MutedNickActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const addMutedNick = async (
    networkId: string,
    nick: string,
    identity?: NetworkUserIdentity | null,
  ) =>
    executeMutation({
      request: () => api.addMutedNick(networkId, nick, identity),
      mapResult: () => true,
      successMessage: 'User muted',
      errorMessage: 'Failed to mute user',
      failureValue: false,
    });

  const removeMutedNick = async (mutedNickId: string) =>
    executeMutation({
      request: () => api.removeMutedNick(mutedNickId),
      mapResult: () => true,
      successMessage: 'User unmuted',
      errorMessage: 'Failed to unmute user',
      failureValue: false,
    });

  return {
    addMutedNick,
    removeMutedNick,
  };
};
