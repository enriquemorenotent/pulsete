import type { BufferState } from '../../shared/protocol-chat.js';
import type { WorkspacePreferencesPatch } from '../../shared/protocol-preferences.js';
import {
  isSameNetworkUserIdentity,
  type NetworkUserIdentity,
} from '../../shared/user-identity.js';
import { api } from './client.js';
import {
  CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS,
  parseContactNotificationSettings,
} from './contact-notifications/settings.js';
import {
  MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY,
  parseMediaVisibilitySettings,
} from './media-visibility-settings.js';
import {
  HIDE_OFFLINE_FRIENDS_STORAGE_KEY,
  parseHideOfflineFriendsPreference,
} from './useAppUiState.js';
import {
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  readSidebarWidth,
} from './sidebar-width.js';
import {
  SERVER_SIDEBAR_ACCORDION_STORAGE_KEY,
  parseServerSidebarAccordionState,
} from './server-sidebar-accordion-state.js';
import {
  USER_AVATAR_SETTINGS_STORAGE_KEY,
  parseUserAvatarSettings,
} from './user-avatars/settings.js';
import {
  parseQueryAvatarOverrides,
  parseUserAvatarOverrideKey,
  parseUserAvatarOverrides,
  QUERY_AVATAR_OVERRIDES_STORAGE_KEY,
  resolveUserAvatarOverrideKey,
  USER_AVATAR_OVERRIDES_STORAGE_KEY,
} from './user-avatars/override-model.js';
import type { ApplyServerMessages } from './app-actions-types.js';

export type BrowserPreferences = Record<string, string>;
const maxLegacyAvatarSourceCharacters = 6 * 1024 * 1024;
const maxLegacyAvatarPayloadCharacters = 24 * 1024 * 1024;
const maxLegacyAvatarOverrides = 1_000;

export const readPulseteBrowserPreferences = (): BrowserPreferences => {
  if (typeof window === 'undefined') {
    return {};
  }
  const preferences: BrowserPreferences = {};
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith('pulsete.')) {
        continue;
      }
      const value = storage.getItem(key);
      if (value !== null) {
        preferences[key] = value;
      }
    }
  } catch {
    return {};
  }
  return preferences;
};

export const restoreLegacyBrowserPreferences = (preferences: BrowserPreferences) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    clearPulseteBrowserPreferences();
    for (const [key, value] of Object.entries(preferences)) {
      if (key.startsWith('pulsete.') && typeof value === 'string') {
        window.localStorage.setItem(key, value);
      }
    }
  } catch {
    // A restored SQLite backup remains usable when browser storage is unavailable.
  }
};

export const clearPulseteBrowserPreferences = () => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith('pulsete.')) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // The server-side import marker prevents duplicate durable writes.
  }
};

export const importCurrentBrowserStorage = async (
  buffers: readonly BufferState[],
  applyServerMessages: ApplyServerMessages,
) => {
  const stored = readPulseteBrowserPreferences();
  const payload = buildLegacyImportPayload(stored, buffers);
  const result = await api.importLegacyPreferences(payload);
  applyServerMessages(result.messages);
  clearPulseteBrowserPreferences();
  return result;
};

export const buildLegacyImportPayload = (
  stored: BrowserPreferences,
  buffers: readonly BufferState[],
) => {
  const preferences: WorkspacePreferencesPatch = {};
  const contactValue = CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS
    .map((key) => stored[key])
    .find((value) => value !== undefined);
  if (contactValue !== undefined) {
    preferences.contactNotifications = parseContactNotificationSettings(contactValue);
  }
  if (stored[MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY] !== undefined) {
    preferences.mediaVisibilityMode = parseMediaVisibilitySettings(
      stored[MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY],
    ).mode;
  }
  if (stored[USER_AVATAR_SETTINGS_STORAGE_KEY] !== undefined) {
    preferences.externalAvatarsEnabled = parseUserAvatarSettings(
      stored[USER_AVATAR_SETTINGS_STORAGE_KEY],
    ).externalAvatarsEnabled;
  }
  if (stored[HIDE_OFFLINE_FRIENDS_STORAGE_KEY] !== undefined) {
    preferences.hideOfflineFriends = parseHideOfflineFriendsPreference(
      stored[HIDE_OFFLINE_FRIENDS_STORAGE_KEY],
    );
  }
  if (stored[SIDEBAR_WIDTH_STORAGE_KEY] !== undefined) {
    preferences.leftSidebarWidth = readSidebarWidth(stored[SIDEBAR_WIDTH_STORAGE_KEY]);
  }
  if (stored[RIGHT_SIDEBAR_WIDTH_STORAGE_KEY] !== undefined) {
    preferences.rightSidebarWidth = readSidebarWidth(stored[RIGHT_SIDEBAR_WIDTH_STORAGE_KEY]);
  }
  const accordionPrefix = `${SERVER_SIDEBAR_ACCORDION_STORAGE_KEY}.`;
  const accordions = Object.fromEntries(
    Object.entries(stored)
      .filter(([key]) => key.startsWith(accordionPrefix))
      .map(([key, value]) => [
        key.slice(accordionPrefix.length),
        parseServerSidebarAccordionState(value),
      ]),
  );
  if (Object.keys(accordions).length > 0) {
    preferences.serverSidebarAccordions = accordions;
  }
  return { preferences, avatarOverrides: collectLegacyAvatarOverrides(stored, buffers) };
};

const collectLegacyAvatarOverrides = (
  stored: BrowserPreferences,
  buffers: readonly BufferState[],
) => {
  const overrides = new Map<string, ReturnType<typeof toAvatarPayload>>();
  for (const [key, source] of Object.entries(parseUserAvatarOverrides(
    stored[USER_AVATAR_OVERRIDES_STORAGE_KEY],
  ))) {
    const target = parseUserAvatarOverrideKey(key);
    if (!target) {
      continue;
    }
    const matchingBuffer = buffers.find((buffer) =>
      buffer.kind === 'query'
      && buffer.networkId === target.networkId
      && isSameNetworkUserIdentity(buffer.peerIdentity, target.identity)
    );
    const resolvedTarget = matchingBuffer
      ? { networkId: matchingBuffer.networkId, nick: matchingBuffer.target, identity: target.identity }
      : target;
    const payload = toAvatarPayload(resolvedTarget, source);
    if (payload) {
      overrides.set(key, payload);
    }
  }
  for (const [bufferId, source] of Object.entries(parseQueryAvatarOverrides(
    stored[QUERY_AVATAR_OVERRIDES_STORAGE_KEY],
  ))) {
    const buffer = buffers.find((candidate) => candidate.id === bufferId && candidate.kind === 'query');
    if (!buffer) {
      continue;
    }
    const target = {
      networkId: buffer.networkId,
      nick: buffer.target,
      identity: buffer.peerIdentity,
    };
    const key = resolveUserAvatarOverrideKey(target, { allowNickFallback: true });
    const payload = toAvatarPayload(target, source);
    if (key && payload && !overrides.has(key)) {
      overrides.set(key, payload);
    }
  }
  const result = [];
  let totalSourceCharacters = 0;
  for (const value of overrides.values()) {
    if (!value || result.length >= maxLegacyAvatarOverrides) {
      continue;
    }
    const sourceCharacters = 'dataUrl' in value
      ? value.dataUrl.length
      : value.externalUrl.length;
    if (totalSourceCharacters + sourceCharacters > maxLegacyAvatarPayloadCharacters) {
      continue;
    }
    totalSourceCharacters += sourceCharacters;
    result.push(value);
  }
  return result;
};

const toAvatarPayload = (
  target: {
    networkId: string;
    nick: string;
    identity?: NetworkUserIdentity | null;
  },
  source: string,
) => {
  if (
    source.length <= maxLegacyAvatarSourceCharacters
    && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(source)
  ) {
    return { ...target, dataUrl: source };
  }
  try {
    const url = new URL(source);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? { ...target, externalUrl: url.toString() }
      : null;
  } catch {
    return null;
  }
};
