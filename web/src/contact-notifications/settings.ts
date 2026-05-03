import type { BufferState, ChatMessage } from '../../../shared/protocol-chat.js';
import {
  type NetworkUserIdentity,
  type NetworkUserIdentityTarget,
  identityFromNick,
  identityKey,
  matchesIdentityScopedEntry,
  networkUserIdentitySchema,
  normalizeNetworkUserIdentity,
} from '../../../shared/user-identity.js';
import type { ConversationMessages } from '../conversation-message-state.js';
import { toConversationMessageKey } from '../conversation-message-state.js';

export const CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY =
  'pulsete.preferences.contactNotifications.v2';
const CONTACT_NOTIFICATION_SETTINGS_V1_STORAGE_KEY =
  'pulsete.preferences.contactNotifications.v1';
const LEGACY_CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY =
  ['pulsete.preferences', 'background' + 'DmAudio.v1'].join('.');
export const CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS = [
  CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
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

export type ContactNotificationContact = {
  identity?: NetworkUserIdentity;
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
  && value.nick.trim().length > 0
  && (value.identity === undefined || networkUserIdentitySchema.safeParse(value.identity).success);

const isValidSound = (value: unknown): value is ContactNotificationSound =>
  typeof value === 'string'
  && CONTACT_NOTIFICATION_SOUND_OPTIONS.some((option) => option.id === value);

const normalizeContact = (contact: ContactNotificationContact): ContactNotificationContact => ({
  identity: normalizeNetworkUserIdentity(contact.identity) ?? identityFromNick(contact.nick),
  networkId: contact.networkId,
  nick: contact.nick.trim(),
});

const dedupeContacts = (contacts: readonly ContactNotificationContact[]) => {
  const deduped: ContactNotificationContact[] = [];
  for (const contact of contacts) {
    const normalized = normalizeContact(contact);
    if (deduped.some((candidate) => contactKey(candidate) === contactKey(normalized))) {
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
    contactKey(candidate) !== contactKey(normalizeContact(contact))
  ),
});

export const isContactNotificationAllowedForTarget = (
  settings: Pick<ContactNotificationSettings, 'contacts'>,
  target: NetworkUserIdentityTarget | null | undefined,
) => !!target && settings.contacts.some((contact) =>
  matchesIdentityScopedEntry(normalizeContact(contact), target)
);

export const isContactNotificationAllowed = (
  settings: ContactNotificationSettings,
  buffer: Pick<BufferState, 'kind' | 'networkId' | 'target'>,
  latestMessage?: Pick<ChatMessage, 'networkId' | 'nick' | 'senderIdentity'> | null,
) =>
  buffer.kind === 'query'
  && isContactNotificationAllowedForTarget(settings, resolveNotificationTarget(buffer, latestMessage));

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

const resolveNotificationTarget = (
  buffer: Pick<BufferState, 'kind' | 'networkId' | 'target'>,
  latestMessage?: Pick<ChatMessage, 'networkId' | 'nick' | 'senderIdentity'> | null,
): NetworkUserIdentityTarget | null => {
  if (buffer.kind !== 'query') {
    return null;
  }
  if (latestMessage?.nick) {
    return {
      networkId: latestMessage.networkId,
      nick: latestMessage.nick,
      identity: latestMessage.senderIdentity ?? identityFromNick(latestMessage.nick),
    };
  }
  return {
    networkId: buffer.networkId,
    nick: buffer.target,
    identity: identityFromNick(buffer.target),
  };
};

const getLatestBufferMessage = (
  messagesByConversation: ConversationMessages | undefined,
  buffer: Pick<BufferState, 'networkId' | 'target'>,
) =>
  messagesByConversation?.[toConversationMessageKey(buffer.networkId, buffer.target)]?.at(-1) ?? null;

const contactKey = (contact: ContactNotificationContact) => {
  const normalized = normalizeContact(contact);
  return `${normalized.networkId}\u0000${identityKey(normalized.identity!)}`;
};
