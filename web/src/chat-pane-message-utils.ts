import type { ChatMessage } from '../../shared/protocol.js';

export type MessageRenderBlock =
  | { kind: 'group'; messages: ChatMessage[]; sourceLabel: string }
  | { kind: 'single'; message: ChatMessage };

export const formatMessageTime = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

export const buildRenderBlocks = (messages: ChatMessage[], mode: 'chat' | 'server') => {
  if (mode === 'chat') {
    return messages.map((message) => ({ kind: 'single', message } satisfies MessageRenderBlock));
  }
  const blocks: MessageRenderBlock[] = [];
  let currentGroup: ChatMessage[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      blocks.push({
        kind: 'group',
        messages: currentGroup,
        sourceLabel: getServerGroupSourceLabel(currentGroup[0]),
      });
      currentGroup = [];
    }
  };

  for (const message of messages) {
    if (!canGroupMessage(message, mode)) {
      flushGroup();
      blocks.push({ kind: 'single', message });
      continue;
    }
    const previous = currentGroup.at(-1);
    if (previous && canContinueGroup(previous, message, mode)) {
      currentGroup.push(message);
      continue;
    }
    flushGroup();
    currentGroup = [message];
  }

  flushGroup();
  return blocks;
};

const getServerGroupSourceLabel = (message: ChatMessage) => {
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
  return '';
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
    return 'border-destructive/40 bg-destructive/10';
  }
  if (message.kind === 'notice') {
    return 'border-primary/30 bg-primary/8';
  }
  if (message.kind === 'join') {
    return 'border-emerald-500/30 bg-emerald-500/10';
  }
  if (message.kind === 'part') {
    return 'border-amber-400/30 bg-amber-400/10';
  }
  if (message.kind === 'quit') {
    return 'border-amber-400/30 bg-amber-400/10';
  }
  if (message.kind === 'system') {
    return 'border-border bg-secondary';
  }
  return message.self ? 'border-primary/35 bg-accent' : 'border-border bg-card';
};

const canGroupMessage = (message: ChatMessage, mode: 'chat' | 'server') =>
  mode === 'server' && getServerGroupSourceLabel(message).length > 0 && !isActionMessage(message);

const canContinueGroup = (previous: ChatMessage, next: ChatMessage, mode: 'chat' | 'server') =>
  getGroupSourceKey(previous, mode) === getGroupSourceKey(next, mode) &&
  previous.kind === next.kind &&
  previous.self === next.self;

const getGroupSourceKey = (message: ChatMessage, mode: 'chat' | 'server') =>
  `${message.kind}:${mode === 'server' ? getServerGroupSourceLabel(message) : ''}`;
