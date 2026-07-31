import type { ServerMessage } from '../shared/protocol-messages.js';
import { notFound } from './app-error.js';
import type {
  RuntimeAvatarOverrideMutations,
  RuntimeDraftMutations,
  RuntimePreferenceMutations,
  RuntimeStore,
} from './runtime-service-types.js';

type PublishMutation = <T extends { messages: readonly ServerMessage[] }>(result: T) => T;

export const createRuntimeUserStateServices = (
  store: RuntimeStore,
  publishMutation: PublishMutation,
): {
  avatarOverrides: RuntimeAvatarOverrideMutations;
  drafts: RuntimeDraftMutations;
  preferences: RuntimePreferenceMutations;
} => {
  const preferences: RuntimePreferenceMutations = {
    update: (patch) => {
      const next = store.preferences.update(patch);
      return publishMutation({
        preferences: next,
        messages: [{ type: 'preferences.updated', preferences: next }],
      });
    },
    importLegacy: (patch, avatars, initiallySkippedAvatarOverrides = 0) => {
      if (!store.preferences.isLegacyBrowserImportPending()) {
        return {
          preferences: store.preferences.get(),
          avatarOverrides: store.avatarOverrides.list(),
          imported: false,
          skippedAvatarOverrides: 0,
          messages: [],
        };
      }
      const importableAvatars = avatars.filter((avatar) =>
        store.networks.get(avatar.networkId) !== null
      );
      const skippedAvatarOverrides = initiallySkippedAvatarOverrides
        + avatars.length
        - importableAvatars.length;
      const result = store.preferences.transaction(() => {
        const nextPreferences = store.preferences.update(patch);
        const nextAvatars = importableAvatars.map((avatar) =>
          store.avatarOverrides.upsert(avatar)
        );
        store.preferences.markLegacyBrowserImported();
        return { nextPreferences, nextAvatars };
      });
      return publishMutation({
        preferences: result.nextPreferences,
        avatarOverrides: result.nextAvatars,
        imported: true,
        skippedAvatarOverrides,
        messages: [
          { type: 'preferences.updated', preferences: result.nextPreferences },
          ...result.nextAvatars.map((avatarOverride) => ({
            type: 'avatar-override.upsert' as const,
            avatarOverride,
          })),
          ...(skippedAvatarOverrides > 0 ? [{
            type: 'notice' as const,
            networkId: null,
            message: `Skipped ${skippedAvatarOverrides} invalid custom avatar${skippedAvatarOverrides === 1 ? '' : 's'} during migration.`,
          }] : []),
          { type: 'browser-storage-import.completed' },
        ],
      });
    },
  };
  const drafts: RuntimeDraftMutations = {
    save: (bufferId, body) => {
      if (!store.conversations.getBuffer(bufferId)) {
        throw notFound('Buffer not found');
      }
      const draft = store.drafts.save(bufferId, body);
      return publishMutation({
        draft,
        messages: [draft
          ? { type: 'draft.upsert', draft }
          : { type: 'draft.remove', bufferId }],
      });
    },
  };
  const avatarOverrides: RuntimeAvatarOverrideMutations = {
    upsert: (input) => {
      if (!store.networks.get(input.networkId)) {
        throw notFound('Network not found');
      }
      const avatarOverride = store.avatarOverrides.upsert(input);
      return publishMutation({
        avatarOverride,
        messages: [{ type: 'avatar-override.upsert', avatarOverride }],
      });
    },
    remove: (id) => {
      if (!store.avatarOverrides.remove(id)) {
        throw notFound('Avatar override not found');
      }
      return publishMutation({
        avatarOverrideId: id,
        messages: [{ type: 'avatar-override.remove', avatarOverrideId: id }],
      });
    },
    source: (id) => store.avatarOverrides.getSource(id),
  };

  return { avatarOverrides, drafts, preferences };
};
