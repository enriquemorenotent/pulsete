import type { ChatMessage } from '../shared/protocol.js';
import { getTranscriptSpeakerLabel } from '../shared/message-speaker.js';

export const renderMessages = (messages: ChatMessage[]) =>
  messages.map(formatMessage).join('\n');

export const renderAssistantMessages = (messages: ChatMessage[]) =>
  messages.map(formatAssistantMessage).join('\n');

export const renderFullTranscriptWithinBudget = (messages: ChatMessage[], budget: number) => {
  const lines: string[] = [];
  let used = 0;
  for (const message of messages) {
    const line = formatAssistantMessage(message);
    used += line.length + (lines.length > 0 ? 1 : 0);
    if (used > budget) {
      return null;
    }
    lines.push(line);
  }
  return lines.join('\n');
};

export const formatMessage = (message: ChatMessage) => {
  const time = formatTimestamp(message.ts);
  if (isEventMessage(message)) {
    return `[${time}] (${message.kind}) ${message.body}`;
  }
  const author = formatTranscriptAuthor(message, false);
  return message.kind === 'action'
    ? `[${time}] * ${author} ${message.body}`
    : `[${time}] ${author}: ${message.body}`;
};

export const formatAssistantMessage = (message: ChatMessage) => {
  const time = formatTimestamp(message.ts);
  if (isEventMessage(message)) {
    return `[${time}] (${message.kind}) ${message.body}`;
  }
  const author = formatTranscriptAuthor(message, true);
  return message.kind === 'action'
    ? `[${time}] * ${author} ${message.body}`
    : `[${time}] ${author}: ${message.body}`;
};

export const formatTimestamp = (ts: number) =>
  new Date(ts).toISOString().replace('T', ' ').slice(0, 16);

const isEventMessage = (message: ChatMessage) =>
  message.kind === 'join' || message.kind === 'part' || message.kind === 'quit' || message.kind === 'system';

const formatTranscriptAuthor = (message: ChatMessage, annotateSelf: boolean) => {
  const speaker = getTranscriptSpeakerLabel(message);
  if (speaker === 'you') {
    if (annotateSelf && message.nick) {
      return `you (${message.nick})`;
    }
    return message.nick ?? 'you';
  }
  return speaker;
};
