import type {
  AssistantAskEvidenceLine,
  ChatMessage,
  SpeakerAttributionConfidence,
  SpeakerRole,
} from './protocol.js';

type MessageSpeakerLike = Pick<
  ChatMessage,
  'nick' | 'self' | 'speakerRole' | 'speakerNick' | 'attributionConfidence'
>;

type EvidenceSpeakerLike = Pick<
  AssistantAskEvidenceLine,
  'speakerRole' | 'speakerNick' | 'attributionConfidence'
>;

const unknownSpeakerLabel = 'Unknown';

export const getSpeakerRole = (message: MessageSpeakerLike): SpeakerRole =>
  message.speakerRole ?? (message.self ? 'self' : 'unknown');

export const getSpeakerNick = (message: Pick<MessageSpeakerLike, 'nick' | 'speakerNick'>) =>
  message.speakerNick ?? message.nick ?? null;

export const getAttributionConfidence = (
  message: Pick<MessageSpeakerLike, 'attributionConfidence'>,
): SpeakerAttributionConfidence => message.attributionConfidence ?? 'low';

export const getEvidenceSpeakerLabel = (line: EvidenceSpeakerLike) => (
  line.speakerRole === 'self' && line.attributionConfidence === 'high'
    ? 'You'
    : line.speakerNick?.trim() || unknownSpeakerLabel
);

export const getTranscriptSpeakerLabel = (message: MessageSpeakerLike) => {
  if (message.self || (getSpeakerRole(message) === 'self' && getAttributionConfidence(message) === 'high')) {
    return 'you';
  }
  return getSpeakerNick(message)?.trim() || unknownSpeakerLabel.toLowerCase();
};
