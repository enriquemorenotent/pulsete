import type { WorkspacePreferencesPatch } from '../../shared/protocol-preferences.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import type { AppActionContext } from './app-actions-types.js';
import { api } from './client.js';
import { createAppMutationExecutor } from './app-mutation.js';

type PreferenceActionParams = Pick<AppActionContext, 'applyServerMessages' | 'updateBanner'>;

export const createPreferenceActions = ({
  applyServerMessages,
  updateBanner,
}: PreferenceActionParams) => {
  const executeMutation = createAppMutationExecutor({ applyServerMessages, updateBanner });
  return {
    updatePreferences: (patch: WorkspacePreferencesPatch) => executeMutation({
      request: () => api.updatePreferences(patch),
      errorMessage: 'Could not save preferences',
      failureValue: false,
      mapResult: () => true,
    }),
    saveDraft: (bufferId: string, body: string) => executeMutation({
      request: () => api.saveDraft(bufferId, body),
      errorMessage: 'Could not save draft',
      failureValue: false,
      mapResult: () => true,
    }),
    saveAvatarOverride: (payload: {
      networkId: string;
      nick: string;
      identity?: NetworkUserIdentity | null;
      dataUrl?: string;
      externalUrl?: string;
    }) => executeMutation({
      request: () => api.saveAvatarOverride(payload),
      errorMessage: 'Could not save custom avatar',
      failureValue: false,
      mapResult: () => true,
    }),
    removeAvatarOverride: (id: string) => executeMutation({
      request: () => api.removeAvatarOverride(id),
      errorMessage: 'Could not remove custom avatar',
      failureValue: false,
      mapResult: () => true,
    }),
  };
};
