import type { MessageArrival } from '../../../shared/protocol-messages.js';
import type { BufferState, ChatMessage } from '../../../shared/protocol-chat.js';
import {
  addContactNotificationChannel,
  addContactNotificationContact,
  dedupeChannels,
  dedupeContacts,
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

export const isMessageArrivalNotificationAllowed = (input: {
  arrival: MessageArrival;
  appVisibleAndFocused: boolean;
  selectedBufferId: string | null;
  settings: ContactNotificationSettings;
}) => {
  const { buffer, message } = input.arrival;
  return (input.settings.enabled || input.settings.systemEnabled)
    && (buffer.kind === 'query' || buffer.kind === 'channel')
    && message.bufferId === buffer.id && message.networkId === buffer.networkId
    && !message.self && (!message.delivery || message.delivery === 'live')
    && ['line', 'action', 'notice'].includes(message.kind)
    && !(input.appVisibleAndFocused && buffer.id === input.selectedBufferId)
    && isContactNotificationAllowed(input.settings, buffer, message);
};

export const canPlayContactNotificationCue = (
  now: number,
  lastPlayedAt: number,
  cooldownMs = CONTACT_NOTIFICATION_COOLDOWN_MS,
) => now - lastPlayedAt >= cooldownMs;
