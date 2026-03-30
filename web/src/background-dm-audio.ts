import type { BufferState } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';

export const BACKGROUND_DM_AUDIO_SETTINGS_STORAGE_KEY =
  'pulsete.preferences.backgroundDmAudio.v1';
export const BACKGROUND_DM_AUDIO_COOLDOWN_MS = 1_000;
export const BACKGROUND_DM_AUDIO_SOUND_OPTIONS = [
  { id: 'chirp', label: 'Chirp' },
  { id: 'bell', label: 'Bell' },
  { id: 'glass', label: 'Glass' },
] as const;
export const DEFAULT_BACKGROUND_DM_AUDIO_SOUND =
  BACKGROUND_DM_AUDIO_SOUND_OPTIONS[0].id;

export type BackgroundDmAudioContact = {
  networkId: string;
  nick: string;
};

export type BackgroundDmAudioSound =
  typeof BACKGROUND_DM_AUDIO_SOUND_OPTIONS[number]['id'];

export type BackgroundDmAudioSettings = {
  enabled: boolean;
  systemEnabled: boolean;
  sound: BackgroundDmAudioSound;
  contacts: BackgroundDmAudioContact[];
};

const defaultSettings: BackgroundDmAudioSettings = {
  enabled: false,
  systemEnabled: false,
  sound: DEFAULT_BACKGROUND_DM_AUDIO_SOUND,
  contacts: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isValidContact = (value: unknown): value is BackgroundDmAudioContact =>
  isRecord(value)
  && typeof value.networkId === 'string'
  && typeof value.nick === 'string'
  && value.networkId.length > 0
  && value.nick.trim().length > 0;

const isValidSound = (value: unknown): value is BackgroundDmAudioSound =>
  typeof value === 'string'
  && BACKGROUND_DM_AUDIO_SOUND_OPTIONS.some((option) => option.id === value);

const normalizeContact = (contact: BackgroundDmAudioContact): BackgroundDmAudioContact => ({
  networkId: contact.networkId,
  nick: contact.nick.trim(),
});

const dedupeContacts = (contacts: readonly BackgroundDmAudioContact[]) => {
  const deduped: BackgroundDmAudioContact[] = [];
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

export const parseBackgroundDmAudioSettings = (
  value: string | null | undefined,
): BackgroundDmAudioSettings => {
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
        : DEFAULT_BACKGROUND_DM_AUDIO_SOUND,
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

export const serializeBackgroundDmAudioSettings = (
  settings: BackgroundDmAudioSettings,
) => JSON.stringify({
  enabled: settings.enabled,
  systemEnabled: settings.systemEnabled,
  sound: settings.sound,
  contacts: dedupeContacts(settings.contacts),
});

export const addBackgroundDmAudioContact = (
  settings: BackgroundDmAudioSettings,
  contact: BackgroundDmAudioContact,
): BackgroundDmAudioSettings => ({
  ...settings,
  contacts: dedupeContacts([...settings.contacts, contact]),
});

export const removeBackgroundDmAudioContact = (
  settings: BackgroundDmAudioSettings,
  contact: BackgroundDmAudioContact,
): BackgroundDmAudioSettings => ({
  ...settings,
  contacts: settings.contacts.filter((candidate) =>
    !(candidate.networkId === contact.networkId && isSameIrcIdentifier(candidate.nick, contact.nick))
  ),
});

export const isBackgroundDmAudioContactAllowed = (
  settings: BackgroundDmAudioSettings,
  buffer: Pick<BufferState, 'kind' | 'networkId' | 'target'>,
) =>
  buffer.kind === 'query'
  && settings.contacts.some((contact) =>
    contact.networkId === buffer.networkId
    && isSameIrcIdentifier(contact.nick, buffer.target)
  );

export const findEligibleBackgroundDmAudioBuffer = (input: {
  previousBuffers: ReadonlyMap<string, Pick<BufferState, 'unread'>>;
  nextBuffers: readonly BufferState[];
  appVisibleAndFocused: boolean;
  selectedBufferId: string | null;
  settings: BackgroundDmAudioSettings;
}) => {
  if (!input.settings.enabled) {
    return null;
  }
  return findEligibleBackgroundDmNotificationBuffer(input);
};

export const findEligibleBackgroundDmNotificationBuffer = (input: {
  previousBuffers: ReadonlyMap<string, Pick<BufferState, 'unread'>>;
  nextBuffers: readonly BufferState[];
  appVisibleAndFocused: boolean;
  selectedBufferId: string | null;
  settings: BackgroundDmAudioSettings;
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
    if (!isBackgroundDmAudioContactAllowed(input.settings, buffer)) {
      continue;
    }
    const previousUnread = input.previousBuffers.get(buffer.id)?.unread ?? 0;
    if (buffer.unread > previousUnread) {
      return buffer;
    }
  }
  return null;
};

export const canPlayBackgroundDmAudioCue = (
  now: number,
  lastPlayedAt: number,
  cooldownMs = BACKGROUND_DM_AUDIO_COOLDOWN_MS,
) => now - lastPlayedAt >= cooldownMs;
