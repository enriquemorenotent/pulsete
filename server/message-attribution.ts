import { defaultIrcServerRules, isServerChannel, type IrcServerRules } from '../shared/irc-server-rules.js';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { SpeakerAttributionConfidence, SpeakerAttributionSource, SpeakerRole } from '../shared/protocol-chat.js';
import type { MessageAttributionUpdate, MessageInput } from './storage-types.js';

export type SpeakerAttribution = Omit<MessageAttributionUpdate, 'id' | 'importBatchId'>;


export const resolveRuntimeMessageAttribution = (
  message: Pick<MessageInput, 'kind' | 'nick' | 'self' | 'target'>,
  rules: IrcServerRules = defaultIrcServerRules,
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
  if (isAmbiguousRuntimeSpeaker(message)) {
    return {
      speakerRole: 'unknown',
      speakerNick: message.nick,
      attributionSource: 'runtime',
      attributionConfidence: 'low',
      self: false,
    };
  }
  if (!isServerChannel(message.target, rules) && message.target !== 'server' && isSameIrcIdentifier(message.nick, message.target, rules.caseMapping)) {
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

export const normalizeStoredAttribution = (
  message: Pick<
    MessageInput,
    'nick' | 'self' | 'speakerRole' | 'speakerNick' | 'attributionSource' | 'attributionConfidence'
  >,
): SpeakerAttribution => {
  const speakerRole = normalizeSpeakerRole(message.speakerRole, message.self);
  const attributionConfidence = normalizeAttributionConfidence(message.attributionConfidence);
  return {
    speakerRole,
    speakerNick: message.speakerNick ?? message.nick,
    attributionSource: normalizeAttributionSource(message.attributionSource),
    attributionConfidence,
    self: resolveStoredSelfFlag(message.self, speakerRole, attributionConfidence),
  };
};

const isAmbiguousRuntimeSpeaker = (
  message: Pick<MessageInput, 'kind' | 'nick' | 'target'>,
) => !message.nick
  || message.kind === 'system'
  || message.kind === 'error'
  || message.target === 'server';

const normalizeSpeakerRole = (value: SpeakerRole | undefined, self: boolean): SpeakerRole =>
  self ? 'self' : value ?? 'unknown';

const normalizeAttributionSource = (value: SpeakerAttributionSource | undefined): SpeakerAttributionSource =>
  value ?? 'unknown';

const normalizeAttributionConfidence = (
  value: SpeakerAttributionConfidence | undefined,
): SpeakerAttributionConfidence => value ?? 'low';

const resolveStoredSelfFlag = (
  self: boolean,
  speakerRole: SpeakerRole,
  attributionConfidence: SpeakerAttributionConfidence,
) => self || (speakerRole === 'self' && attributionConfidence === 'high');
