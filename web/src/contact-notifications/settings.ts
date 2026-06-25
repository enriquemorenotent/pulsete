import type { BufferState, ChatMessage } from '../../../shared/protocol-chat.js';
import {
  addContactNotificationChannel,
  addContactNotificationContact,
  dedupeChannels,
  dedupeContacts,
  hasNotificationTargets,
  isContactNotificationAllowedForTarget,
  isContactNotificationChannelAllowed,
  isConversationNotificationAllowed,
  isRecord,
  isValidChannel,
  isValidContact,
  removeContactNotificationChannel,
  removeContactNotificationContact,
  type ContactNotificationChannel,
  type ContactNotificationContact,
} from './targets.js';
import type { ConversationMessages } from '../conversation-message-state.js';

export const CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY =
  'pulsete.preferences.contactNotifications.v3';
const CONTACT_NOTIFICATION_SETTINGS_V2_STORAGE_KEY =
  'pulsete.preferences.contactNotifications.v2';
const CONTACT_NOTIFICATION_SETTINGS_V1_STORAGE_KEY =
  'pulsete.preferences.contactNotifications.v1';
const LEGACY_CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY =
  ['pulsete.preferences', 'background' + 'DmAudio.v1'].join('.');
export const CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS = [
  CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
  CONTACT_NOTIFICATION_SETTINGS_V2_STORAGE_KEY,
  CONTACT_NOTIFICATION_SETTINGS_V1_STORAGE_KEY,
  LEGACY_CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
] as readonly string[];
export const CONTACT_NOTIFICATION_COOLDOWN_MS = 1_000;
export const CONTACT_NOTIFICATION_SOUND_OPTIONS = [
  { id: 'chirp', label: 'Chirp' },
  { id: 'bell', label: 'Bell' },
  { id: 'glass', label: 'Glass' },
] as const;
export const DEFAULT_CONTACT_NOTIFICATION_SOUND =
  CONTACT_NOTIFICATION_SOUND_OPTIONS[0].id;

export type ContactNotificationSound =
  typeof CONTACT_NOTIFICATION_SOUND_OPTIONS[number]['id'];

export type {
  ContactNotificationChannel,
  ContactNotificationContact,
};
export {
  addContactNotificationChannel,
  addContactNotificationContact,
  isContactNotificationAllowedForTarget,
  isContactNotificationChannelAllowed,
  removeContactNotificationChannel,
  removeContactNotificationContact,
};

export type ContactNotificationSettings = {
  enabled: boolean;
  systemEnabled: boolean;
  sound: ContactNotificationSound;
  contacts: ContactNotificationContact[];
  channels: ContactNotificationChannel[];
};

const defaultSettings: ContactNotificationSettings = {
  enabled: false,
  systemEnabled: false,
  sound: DEFAULT_CONTACT_NOTIFICATION_SOUND,
  contacts: [],
  channels: [],
};

const isValidSound = (value: unknown): value is ContactNotificationSound =>
  typeof value === 'string'
  && CONTACT_NOTIFICATION_SOUND_OPTIONS.some((option) => option.id === value);

export const parseContactNotificationSettings = (
  value: string | null | undefined,
): ContactNotificationSettings => {
  if (!value) {
    return defaultSettings;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return defaultSettings;
    }
    return {
      enabled: parsed.enabled === true,
      systemEnabled: parsed.systemEnabled === true,
      sound: isValidSound(parsed.sound)
        ? parsed.sound
        : DEFAULT_CONTACT_NOTIFICATION_SOUND,
      contacts: dedupeContacts(
        Array.isArray(parsed.contacts)
          ? parsed.contacts.filter(isValidContact)
          : [],
      ),
      channels: dedupeChannels(
        Array.isArray(parsed.channels)
          ? parsed.channels.filter(isValidChannel)
          : [],
      ),
    };
  } catch {
    return defaultSettings;
  }
};

export const serializeContactNotificationSettings = (
  settings: ContactNotificationSettings,
) => JSON.stringify({
  enabled: settings.enabled,
  systemEnabled: settings.systemEnabled,
  sound: settings.sound,
  contacts: dedupeContacts(settings.contacts),
  channels: dedupeChannels(settings.channels),
});

export const isContactNotificationAllowed = (
  settings: ContactNotificationSettings,
  buffer: Pick<BufferState, 'kind' | 'networkId' | 'target'>,
  latestMessage?: Pick<ChatMessage, 'networkId' | 'nick' | 'senderIdentity'> | null,
) => isConversationNotificationAllowed(settings, buffer, latestMessage);

export const findEligibleContactNotificationSoundBuffer = (input: {
  previousBuffers: ReadonlyMap<string, Pick<BufferState, 'unread'>>;
  nextBuffers: readonly BufferState[];
  messagesByConversation?: ConversationMessages;
  appVisibleAndFocused: boolean;
  selectedBufferId: string | null;
  settings: ContactNotificationSettings;
}) => {
  if (!input.settings.enabled) {
    return null;
  }
  return findEligibleContactNotificationBuffer(input);
};

export const findEligibleContactNotificationBuffer = (input: {
  previousBuffers: ReadonlyMap<string, Pick<BufferState, 'unread'>>;
  nextBuffers: readonly BufferState[];
  messagesByConversation?: ConversationMessages;
  appVisibleAndFocused: boolean;
  selectedBufferId: string | null;
  settings: ContactNotificationSettings;
}) => {
  if (!hasNotificationTargets(input.settings)) {
    return null;
  }
  for (const buffer of input.nextBuffers) {
    if (
      (buffer.kind !== 'query' && buffer.kind !== 'channel')
      || (input.appVisibleAndFocused && buffer.id === input.selectedBufferId)
    ) {
      continue;
    }
    if (!isContactNotificationAllowed(
      input.settings,
      buffer,
      getLatestBufferMessage(input.messagesByConversation, buffer),
    )) {
      continue;
    }
    const previousUnread = input.previousBuffers.get(buffer.id)?.unread ?? 0;
    if (buffer.unread > previousUnread) {
      return buffer;
    }
  }
  return null;
};

export const canPlayContactNotificationCue = (
  now: number,
  lastPlayedAt: number,
  cooldownMs = CONTACT_NOTIFICATION_COOLDOWN_MS,
) => now - lastPlayedAt >= cooldownMs;

const getLatestBufferMessage = (
  messagesByConversation: ConversationMessages | undefined,
  buffer: Pick<BufferState, 'id'>,
) =>
  messagesByConversation?.[buffer.id]?.at(-1) ?? null;
