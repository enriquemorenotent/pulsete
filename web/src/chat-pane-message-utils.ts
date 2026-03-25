import type { ChatMessage } from '../../shared/protocol.js';

export type MessageRenderBlock = { kind: 'single'; message: ChatMessage };

export const formatMessageTimestamp = (value: number) => {
  const date = new Date(value);
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-')
    + ` ${[
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
      padDatePart(date.getSeconds()),
    ].join(':')}`;
};

export const buildRenderBlocks = (messages: ChatMessage[]) =>
  messages.map((message) => ({ kind: 'single', message } satisfies MessageRenderBlock));

export const getServerMessageSourceLabel = (message: ChatMessage) => {
  if (message.nick) {
    return message.nick;
  }
  if (message.kind === 'system') {
    return 'Server';
  }
  if (message.kind === 'notice') {
    return 'Notice';
  }
  if (message.kind === 'error') {
    return 'Error';
  }
  return null;
};

export const isCompactMessage = (message: ChatMessage) =>
  message.kind === 'line'
  || message.kind === 'action'
  || message.kind === 'join'
  || message.kind === 'part'
  || message.kind === 'quit';

export const isActionMessage = (message: ChatMessage) => message.kind === 'action';

export const showKindLabel = (message: ChatMessage) =>
  message.kind === 'notice' || message.kind === 'error';

export const participantNickTone = (
  message: ChatMessage,
  highlightParticipants: boolean,
) => {
  if (!highlightParticipants || !message.nick) {
    return 'text-inherit';
  }
  return message.self ? 'text-primary' : 'text-success';
};

export const messageTone = (message: ChatMessage) => {
  if (message.kind === 'error') {
    return 'text-destructive';
  }
  if (message.kind === 'notice') {
    return 'text-primary';
  }
  if (message.kind === 'join') {
    return 'text-emerald-300';
  }
  if (message.kind === 'part') {
    return 'text-amber-300';
  }
  if (message.kind === 'quit') {
    return 'text-red-500';
  }
  if (message.kind === 'system') {
    return 'text-muted-foreground';
  }
  return '';
};

const padDatePart = (value: number) => String(value).padStart(2, '0');
