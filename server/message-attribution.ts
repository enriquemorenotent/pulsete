import { isSameIrcIdentifier, normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type {
  NetworkProfile,
  SpeakerAttributionConfidence,
  SpeakerAttributionSource,
  SpeakerRole,
} from '../shared/protocol.js';
import type { MessageAttributionUpdate, MessageInput } from './storage-types.js';

export type SpeakerAttribution = Omit<MessageAttributionUpdate, 'id' | 'importBatchId'>;

type QuerySpeakerAttributionInput = {
  nick: string | null;
  target: string;
  selfNickKeys: Set<string>;
  selfSource: SpeakerAttributionSource;
};

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

export const buildSelfNickKeys = (
  network: Pick<NetworkProfile, 'nick' | 'altNicks'>,
  extraNicks: string[] = [],
) => normalizeNickAliases([
  network.nick,
  ...(network.altNicks ?? []),
  ...extraNicks,
]);

export const normalizeNickAliases = (nicks: string[]) => {
  const keys = new Set<string>();
  for (const nick of nicks) {
    const trimmed = nick.trim();
    if (!trimmed) {
      continue;
    }
    keys.add(normalizeIrcIdentifier(trimmed));
  }
  return keys;
};

export const mergeNickAliases = (nicks: string[], excludedNicks: string[] = []) => {
  const excluded = normalizeNickAliases(excludedNicks);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const nick of nicks) {
    const trimmed = nick.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeIrcIdentifier(trimmed);
    if (excluded.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
};

export const matchesNickAlias = (nick: string | null, keys: Set<string>) =>
  !!nick && keys.has(normalizeIrcIdentifier(nick));

export const resolveImportedSpeakerAttribution = (
  input: Omit<QuerySpeakerAttributionInput, 'selfSource'>,
): SpeakerAttribution => resolveQuerySpeakerAttribution({ ...input, selfSource: 'query-alias' });

export const resolveImportedChannelAttribution = (
  input: Pick<QuerySpeakerAttributionInput, 'nick' | 'selfNickKeys'>,
): SpeakerAttribution => {
  if (!input.nick) {
    return createUnknownAttribution(null, 'unknown', 'low');
  }
  if (matchesNickAlias(input.nick, input.selfNickKeys)) {
    return {
      speakerRole: 'self',
      speakerNick: input.nick,
      attributionSource: 'import-alias',
      attributionConfidence: 'high',
      self: true,
    };
  }
  return {
    speakerRole: 'other',
    speakerNick: input.nick,
    attributionSource: 'unknown',
    attributionConfidence: 'low',
    self: false,
  };
};

export const resolveQueryRepairAttribution = (
  input: Omit<QuerySpeakerAttributionInput, 'selfSource'>,
): SpeakerAttribution => {
  const attribution = resolveQuerySpeakerAttribution({ ...input, selfSource: 'query-alias' });
  if (attribution.speakerRole !== 'unknown') {
    return attribution;
  }
  return {
    ...attribution,
    speakerNick: input.nick,
  };
};

export const resolveRuntimeMessageAttribution = (
  message: Pick<MessageInput, 'nick' | 'self' | 'target'>,
): SpeakerAttribution => {
  if (message.self) {
    return {
      speakerRole: 'self',
      speakerNick: message.nick,
      attributionSource: 'runtime',
      attributionConfidence: 'high',
      self: true,
    };
  }
  if (!message.nick) {
    return {
      speakerRole: 'unknown',
      speakerNick: null,
      attributionSource: 'runtime',
      attributionConfidence: 'low',
      self: false,
    };
  }
  if (!isChannelTarget(message.target) && message.target !== 'server' && isSameIrcIdentifier(message.nick, message.target)) {
    return {
      speakerRole: 'peer',
      speakerNick: message.nick,
      attributionSource: 'runtime',
      attributionConfidence: 'high',
      self: false,
    };
  }
  return {
    speakerRole: 'other',
    speakerNick: message.nick,
    attributionSource: 'runtime',
    attributionConfidence: 'high',
    self: false,
  };
};

const resolveQuerySpeakerAttribution = ({
  nick,
  target,
  selfNickKeys,
  selfSource,
}: QuerySpeakerAttributionInput): SpeakerAttribution => {
  if (!nick) {
    return createUnknownAttribution(null, 'unknown', 'low');
  }
  const isSelf = matchesNickAlias(nick, selfNickKeys);
  const isPeer = isSameIrcIdentifier(nick, target);
  if (isSelf && isPeer) {
    return createUnknownAttribution(nick, 'unknown', 'low');
  }
  if (isSelf) {
    return {
      speakerRole: 'self',
      speakerNick: nick,
      attributionSource: selfSource,
      attributionConfidence: 'high',
      self: true,
    };
  }
  if (isPeer) {
    return {
      speakerRole: 'peer',
      speakerNick: nick,
      attributionSource: 'query-target',
      attributionConfidence: 'high',
      self: false,
    };
  }
  return createUnknownAttribution(nick, 'unknown', 'low');
};

const createUnknownAttribution = (
  speakerNick: string | null,
  attributionSource: SpeakerAttributionSource,
  attributionConfidence: SpeakerAttributionConfidence,
): SpeakerAttribution => ({
  speakerRole: 'unknown',
  speakerNick,
  attributionSource,
  attributionConfidence,
  self: false,
});

export const normalizeStoredAttribution = (
  message: Pick<
    MessageInput,
    'nick' | 'self' | 'speakerRole' | 'speakerNick' | 'attributionSource' | 'attributionConfidence'
  >,
): SpeakerAttribution => ({
  speakerRole: normalizeSpeakerRole(message.speakerRole, message.self),
  speakerNick: message.speakerNick ?? message.nick,
  attributionSource: normalizeAttributionSource(message.attributionSource),
  attributionConfidence: normalizeAttributionConfidence(message.attributionConfidence),
  self: Boolean(message.self),
});

const normalizeSpeakerRole = (value: SpeakerRole | undefined, self: boolean): SpeakerRole =>
  value ?? (self ? 'self' : 'unknown');

const normalizeAttributionSource = (value: SpeakerAttributionSource | undefined): SpeakerAttributionSource =>
  value ?? 'unknown';

const normalizeAttributionConfidence = (
  value: SpeakerAttributionConfidence | undefined,
): SpeakerAttributionConfidence => value ?? 'low';
