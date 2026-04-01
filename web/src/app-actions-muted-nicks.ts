import type { AppActionContext } from './app-actions-types.js';
import { createAppMutationExecutor } from './app-mutation.js';
import { api } from './client.js';

type MutedNickActionParams = Pick<
  AppActionContext,
  'applyServerMessages' | 'updateBanner'
>;

export const createMutedNickActions = ({
  applyServerMessages,
  updateBanner,
}: MutedNickActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });

  const addMutedNick = async (networkId: string, nick: string) =>
    executeMutation({
      request: () => api.addMutedNick(networkId, nick),
      mapResult: () => true,
      successMessage: 'Nick muted',
      errorMessage: 'Failed to mute nick',
      failureValue: false,
    });

  const removeMutedNick = async (mutedNickId: string) =>
    executeMutation({
      request: () => api.removeMutedNick(mutedNickId),
      mapResult: () => true,
      successMessage: 'Nick unmuted',
      errorMessage: 'Failed to unmute nick',
      failureValue: false,
    });

  return {
    addMutedNick,
    removeMutedNick,
  };
};
