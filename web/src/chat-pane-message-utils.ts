import type { ChatMessage } from '../../shared/protocol-chat.js';
import type { InlineImageRenderingMode } from './formatted-message-content.js';

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
  const date = new Date(value);
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
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
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

export const getServerMessageDisplayBody = (message: ChatMessage) =>
  message.kind === 'system' ? message.body.replace(/^\*\s+/, '') : message.body;

export const isCompactMessage = (message: ChatMessage) =>
  message.kind === 'line'
  || message.kind === 'action'
  || (message.kind === 'notice' && !!message.nick)
  || message.kind === 'system'
  || message.kind === 'join'
  || message.kind === 'part'
  || message.kind === 'quit';

export const isActionMessage = (message: ChatMessage) => message.kind === 'action';

export const getLifecycleEventLabel = (message: ChatMessage) => {
  if (message.kind === 'join') {
    return 'JOIN';
  }
  if (message.kind === 'part') {
    return 'PART';
  }
  if (message.kind === 'quit') {
    return 'QUIT';
  }
  return null;
};

export const getLifecycleEventTone = (message: ChatMessage) => {
  if (message.kind === 'join') {
    return 'border-emerald-300/22 bg-emerald-300/[0.06] text-emerald-200';
  }
  if (message.kind === 'part') {
    return 'border-amber-300/22 bg-amber-300/[0.06] text-amber-200';
  }
  if (message.kind === 'quit') {
    return 'border-red-500/24 bg-red-500/[0.06] text-red-300';
  }
  return 'border-white/10 bg-white/[0.04] text-[var(--transcript-secondary)]';
};

export const getLifecycleEventSummary = (message: ChatMessage) => {
  if (!isLifecycleEventMessage(message)) {
    return null;
  }
  const nick = message.nick ?? 'Someone';
  if (message.kind === 'part' && message.body.includes(' was kicked from ')) {
    return getKickEventSummary(message, nick);
  }
  const reason = getLifecycleReason(message.body, message.kind);
  return reason ? `${nick} (${reason})` : nick;
};

export const isLifecycleEventMessage = (message: ChatMessage) => getLifecycleEventLabel(message) !== null;

export const resolveMessageInlineImageRendering = (
  message: ChatMessage,
  rendering: InlineImageRenderingMode = 'preview',
): InlineImageRenderingMode =>
  isLifecycleEventMessage(message) && rendering === 'preview'
    ? 'link'
    : rendering;

export const showKindLabel = (message: ChatMessage) =>
  message.kind === 'notice' || message.kind === 'error';

export const messageTone = (message: ChatMessage) => {
  if (message.kind === 'error') {
    return 'text-destructive';
  }
  if (message.kind === 'notice') {
    return 'text-[var(--transcript-notice)]';
  }
  if (message.kind === 'system' || isLifecycleEventMessage(message)) {
    return 'text-[var(--transcript-secondary)]';
  }
  return 'text-[var(--transcript-message)]';
};

export const messageDeliveryTone = (message: ChatMessage) =>
  message.delivery === 'server-history'
    ? 'bg-cyan-400/[0.045] shadow-[inset_2px_0_0_rgb(103_232_249_/_0.28)]'
    : null;

const padDatePart = (value: number) => String(value).padStart(2, '0');

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const getKickEventSummary = (message: ChatMessage, nick: string) => {
  const match = message.body.match(/^.+? was kicked from \S+ by (.+?)(?: \((.*)\))?$/);
  const actor = match?.[1]?.trim();
  const reason = getLifecycleReason(message.body, message.kind);
  const detail = actor ? `${nick} kicked by ${actor}` : `${nick} kicked`;
  return reason ? `${detail} (${reason})` : detail;
};

const getLifecycleReason = (body: string, kind: ChatMessage['kind']) => {
  const match = body.match(/\s\((.*)\)$/);
  const reason = match?.[1]?.trim();
  if (!reason || isDefaultLifecycleReason(reason, kind)) {
    return null;
  }
  return reason;
};

const isDefaultLifecycleReason = (reason: string, kind: ChatMessage['kind']) => {
  const normalizedReason = reason.toLowerCase();
  return (
    (kind === 'part' && (normalizedReason === 'left' || normalizedReason === 'kicked'))
    || (kind === 'quit' && normalizedReason === 'quit')
  );
};

const getLocalDayKey = (value: number) => {
  const date = new Date(value);
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
};
