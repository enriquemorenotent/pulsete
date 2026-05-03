import type {
  ChatMessage,
  SpeakerAttributionConfidence,
  SpeakerRole,
} from './protocol-chat.js';

type MessageSpeakerLike = Pick<
  ChatMessage,
  'nick' | 'self' | 'speakerRole' | 'speakerNick' | 'attributionConfidence'
>;

const unknownSpeakerLabel = 'Unknown';

export const getSpeakerRole = (message: MessageSpeakerLike): SpeakerRole =>
  message.speakerRole ?? (message.self ? 'self' : 'unknown');

export const getSpeakerNick = (message: Pick<MessageSpeakerLike, 'nick' | 'speakerNick'>) =>
  message.speakerNick ?? message.nick ?? null;

export const getAttributionConfidence = (
  message: Pick<MessageSpeakerLike, 'attributionConfidence'>,
): SpeakerAttributionConfidence => message.attributionConfidence ?? 'low';

export const getTranscriptSpeakerLabel = (message: MessageSpeakerLike) => {
  if (message.self || (getSpeakerRole(message) === 'self' && getAttributionConfidence(message) === 'high')) {
    return 'you';
  }
  return getSpeakerNick(message)?.trim() || unknownSpeakerLabel.toLowerCase();
};
