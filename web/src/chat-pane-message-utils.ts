import type { ChatMessage } from '../../shared/protocol.js';

export type MessageRenderBlock =
  | { kind: 'day-divider'; key: string; label: string }
  | { kind: 'single'; message: ChatMessage; messageIndex: number };

export const formatMessageTime = (value: number) => {
  const date = new Date(value);
  return [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
  ].join(':');
};

export const formatMessageTimestampTitle = (value: number) => {
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

export const formatMessageTimestampDateTime = (value: number) => new Date(value).toISOString();

export const formatDayDividerLabel = (value: number, now = Date.now()) => {
  const dayKey = getLocalDayKey(value);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (dayKey === getLocalDayKey(today.getTime())) {
    return 'Today';
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === getLocalDayKey(yesterday.getTime())) {
    return 'Yesterday';
  }
  return dayKey;
};

export const buildRenderBlocks = (messages: ChatMessage[], now = Date.now()) => {
  const blocks: MessageRenderBlock[] = [];
  let previousDayKey: string | null = null;
  messages.forEach((message, messageIndex) => {
    const dayKey = getLocalDayKey(message.ts);
    if (dayKey !== previousDayKey) {
      blocks.push({
        kind: 'day-divider',
        key: `day-${dayKey}`,
        label: formatDayDividerLabel(message.ts, now),
      });
      previousDayKey = dayKey;
    }
    blocks.push({ kind: 'single', message, messageIndex });
  });
  return blocks;
};

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

const getLocalDayKey = (value: number) => {
  const date = new Date(value);
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
};
