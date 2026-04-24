import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type {
  SpeakerAttributionConfidence,
  SpeakerAttributionSource,
  SpeakerRole,
} from '../shared/protocol.js';
import type { MessageAttributionUpdate, MessageInput } from './storage-types.js';

export type SpeakerAttribution = Omit<MessageAttributionUpdate, 'id' | 'importBatchId'>;

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);

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
