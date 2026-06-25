import type { BufferState, ChatMessage } from '../../../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../../../shared/irc-identifiers.js';
import {
  type NetworkUserIdentity,
  type NetworkUserIdentityTarget,
  identityFromNick,
  identityKey,
  matchesIdentityScopedEntry,
  networkUserIdentitySchema,
  normalizeNetworkUserIdentity,
} from '../../../shared/user-identity.js';

export type ContactNotificationContact = {
  identity?: NetworkUserIdentity;
  networkId: string;
  nick: string;
};

export type ContactNotificationChannel = {
  channel: string;
  networkId: string;
};

type ContactNotificationContactSettings = {
  contacts: readonly ContactNotificationContact[];
};

type ContactNotificationChannelSettings = {
  channels: readonly ContactNotificationChannel[];
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isValidContact = (value: unknown): value is ContactNotificationContact =>
  isRecord(value)
  && typeof value.networkId === 'string'
  && typeof value.nick === 'string'
  && value.networkId.length > 0
  && value.nick.trim().length > 0
  && (value.identity === undefined || networkUserIdentitySchema.safeParse(value.identity).success);

export const isValidChannel = (value: unknown): value is ContactNotificationChannel =>
  isRecord(value)
  && typeof value.networkId === 'string'
  && typeof value.channel === 'string'
  && value.networkId.length > 0
  && value.channel.trim().length > 0;

export const normalizeContact = (contact: ContactNotificationContact): ContactNotificationContact => ({
  identity: normalizeNetworkUserIdentity(contact.identity) ?? identityFromNick(contact.nick),
  networkId: contact.networkId,
  nick: contact.nick.trim(),
});

export const normalizeChannel = (channel: ContactNotificationChannel): ContactNotificationChannel => ({
  channel: channel.channel.trim(),
  networkId: channel.networkId,
});

export const dedupeContacts = (contacts: readonly ContactNotificationContact[]) => {
  const deduped: ContactNotificationContact[] = [];
  for (const contact of contacts) {
    const normalized = normalizeContact(contact);
    if (!deduped.some((candidate) => contactKey(candidate) === contactKey(normalized))) {
      deduped.push(normalized);
    }
  }
  return deduped;
};

export const dedupeChannels = (channels: readonly ContactNotificationChannel[]) => {
  const deduped: ContactNotificationChannel[] = [];
  for (const channel of channels) {
    const normalized = normalizeChannel(channel);
    if (!deduped.some((candidate) => channelKey(candidate) === channelKey(normalized))) {
      deduped.push(normalized);
    }
  }
  return deduped;
};

export const addContactNotificationContact = <T extends ContactNotificationContactSettings>(
  settings: T,
  contact: ContactNotificationContact,
): T => ({
  ...settings,
  contacts: dedupeContacts([...settings.contacts, contact]),
});

export const removeContactNotificationContact = <T extends ContactNotificationContactSettings>(
  settings: T,
  contact: ContactNotificationContact,
): T => {
  const normalizedContact = normalizeContact(contact);
  const removalTarget: NetworkUserIdentityTarget = normalizedContact;
  return {
    ...settings,
    contacts: settings.contacts.filter((candidate) => {
      const normalizedCandidate = normalizeContact(candidate);
      return contactKey(normalizedCandidate) !== contactKey(normalizedContact)
        && !matchesIdentityScopedEntry(normalizedCandidate, removalTarget);
    }),
  };
};

export const addContactNotificationChannel = <T extends ContactNotificationChannelSettings>(
  settings: T,
  channel: ContactNotificationChannel,
): T => ({
  ...settings,
  channels: dedupeChannels([...settings.channels, channel]),
});

export const removeContactNotificationChannel = <T extends ContactNotificationChannelSettings>(
  settings: T,
  channel: ContactNotificationChannel,
): T => {
  const removalKey = channelKey(channel);
  return {
    ...settings,
    channels: settings.channels.filter((candidate) => channelKey(candidate) !== removalKey),
  };
};

export const isContactNotificationAllowedForTarget = (
  settings: ContactNotificationContactSettings,
  target: NetworkUserIdentityTarget | null | undefined,
) => !!target && settings.contacts.some((contact) =>
  matchesIdentityScopedEntry(normalizeContact(contact), target)
);

export const isContactNotificationChannelAllowed = (
  settings: ContactNotificationChannelSettings,
  target: ContactNotificationChannel | null | undefined,
) => !!target && settings.channels.some((channel) => channelKey(channel) === channelKey(target));

export const isConversationNotificationAllowed = (
  settings: ContactNotificationContactSettings & ContactNotificationChannelSettings,
  buffer: Pick<BufferState, 'kind' | 'networkId' | 'target'>,
  latestMessage?: Pick<ChatMessage, 'networkId' | 'nick' | 'senderIdentity'> | null,
) => {
  if (buffer.kind === 'query') {
    return isContactNotificationAllowedForTarget(
      settings,
      resolveNotificationTarget(buffer, latestMessage),
    );
  }
  if (buffer.kind === 'channel') {
    return isContactNotificationChannelAllowed(settings, {
      channel: buffer.target,
      networkId: buffer.networkId,
    });
  }
  return false;
};

export const hasNotificationTargets = (
  settings: ContactNotificationContactSettings & ContactNotificationChannelSettings,
) => settings.contacts.length > 0 || settings.channels.length > 0;

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

const contactKey = (contact: ContactNotificationContact) => {
  const normalized = normalizeContact(contact);
  return `${normalized.networkId}\u0000${identityKey(normalized.identity!)}`;
};

const channelKey = (channel: ContactNotificationChannel) => {
  const normalized = normalizeChannel(channel);
  return `${normalized.networkId}\u0000${normalizeIrcIdentifier(normalized.channel)}`;
};
