import type { BufferState } from '../../../shared/protocol-chat.js';
import { isSameIrcIdentifier } from '../../../shared/irc-identifiers.js';

export const CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY =
  'pulsete.preferences.contactNotifications.v1';
const LEGACY_CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY =
  ['pulsete.preferences', 'background' + 'DmAudio.v1'].join('.');
export const CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS = [
  CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
  LEGACY_CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
] as const;
export const CONTACT_NOTIFICATION_COOLDOWN_MS = 1_000;
export const CONTACT_NOTIFICATION_SOUND_OPTIONS = [
  { id: 'chirp', label: 'Chirp' },
  { id: 'bell', label: 'Bell' },
  { id: 'glass', label: 'Glass' },
] as const;
export const DEFAULT_CONTACT_NOTIFICATION_SOUND =
  CONTACT_NOTIFICATION_SOUND_OPTIONS[0].id;

export type ContactNotificationContact = {
  networkId: string;
  nick: string;
};

export type ContactNotificationSound =
  typeof CONTACT_NOTIFICATION_SOUND_OPTIONS[number]['id'];

export type ContactNotificationSettings = {
  enabled: boolean;
  systemEnabled: boolean;
  sound: ContactNotificationSound;
  contacts: ContactNotificationContact[];
};

const defaultSettings: ContactNotificationSettings = {
  enabled: false,
  systemEnabled: false,
  sound: DEFAULT_CONTACT_NOTIFICATION_SOUND,
  contacts: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidContact = (value: unknown): value is ContactNotificationContact =>
  isRecord(value)
  && typeof value.networkId === 'string'
  && typeof value.nick === 'string'
  && value.networkId.length > 0
  && value.nick.trim().length > 0;

const isValidSound = (value: unknown): value is ContactNotificationSound =>
  typeof value === 'string'
  && CONTACT_NOTIFICATION_SOUND_OPTIONS.some((option) => option.id === value);

const normalizeContact = (contact: ContactNotificationContact): ContactNotificationContact => ({
  networkId: contact.networkId,
  nick: contact.nick.trim(),
});

const dedupeContacts = (contacts: readonly ContactNotificationContact[]) => {
  const deduped: ContactNotificationContact[] = [];
  for (const contact of contacts) {
    const normalized = normalizeContact(contact);
    if (deduped.some((candidate) =>
      candidate.networkId === normalized.networkId
      && isSameIrcIdentifier(candidate.nick, normalized.nick)
    )) {
      continue;
    }
    deduped.push(normalized);
  }
  return deduped;
};

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
});

export const addContactNotificationContact = (
  settings: ContactNotificationSettings,
  contact: ContactNotificationContact,
): ContactNotificationSettings => ({
  ...settings,
  contacts: dedupeContacts([...settings.contacts, contact]),
});

export const removeContactNotificationContact = (
  settings: ContactNotificationSettings,
  contact: ContactNotificationContact,
): ContactNotificationSettings => ({
  ...settings,
  contacts: settings.contacts.filter((candidate) =>
    !(candidate.networkId === contact.networkId && isSameIrcIdentifier(candidate.nick, contact.nick))
  ),
});

export const isContactNotificationAllowed = (
  settings: ContactNotificationSettings,
  buffer: Pick<BufferState, 'kind' | 'networkId' | 'target'>,
) =>
  buffer.kind === 'query'
  && settings.contacts.some((contact) =>
    contact.networkId === buffer.networkId
    && isSameIrcIdentifier(contact.nick, buffer.target)
  );

export const findEligibleContactNotificationSoundBuffer = (input: {
  previousBuffers: ReadonlyMap<string, Pick<BufferState, 'unread'>>;
  nextBuffers: readonly BufferState[];
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
  appVisibleAndFocused: boolean;
  selectedBufferId: string | null;
  settings: ContactNotificationSettings;
}) => {
  if (input.settings.contacts.length === 0) {
    return null;
  }
  for (const buffer of input.nextBuffers) {
    if (
      buffer.kind !== 'query'
      || (input.appVisibleAndFocused && buffer.id === input.selectedBufferId)
    ) {
      continue;
    }
    if (!isContactNotificationAllowed(input.settings, buffer)) {
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
