import type { BufferState } from '../shared/protocol.js';
import { hasIrcMention } from './message-mentions.js';
import type { MessageInput } from './storage-types.js';

type BufferActivityInput = {
  buffer: BufferState;
  message: MessageInput;
  currentNick?: string | null;
  altNicks?: readonly string[];
};

const channelPriorityKinds = new Set<MessageInput['kind']>(['line', 'action', 'notice']);

export const shouldIncrementUnread = (message: MessageInput) =>
  !message.self && (message.target === 'server' || message.kind !== 'system');

export const shouldIncrementPriorityUnread = (input: BufferActivityInput) => {
  if (!shouldIncrementUnread(input.message)) {
    return false;
  }
  if (input.buffer.kind === 'query') {
    return true;
  }
  if (input.buffer.kind !== 'channel' || !channelPriorityKinds.has(input.message.kind)) {
    return false;
  }
  return hasIrcMention(input.message.body, [
    input.currentNick ?? '',
    ...(input.altNicks ?? []),
  ]);
};

export const resolveNextBufferActivity = (input: BufferActivityInput) => {
  const nextUnread = shouldIncrementUnread(input.message) ? input.buffer.unread + 1 : input.buffer.unread;
  const nextPriorityUnread = shouldIncrementPriorityUnread(input)
    ? input.buffer.priorityUnread + 1
    : input.buffer.priorityUnread;
  if (nextUnread === input.buffer.unread && nextPriorityUnread === input.buffer.priorityUnread) {
    return input.buffer;
  }
  return {
    ...input.buffer,
    unread: nextUnread,
    priorityUnread: nextPriorityUnread,
  };
};
