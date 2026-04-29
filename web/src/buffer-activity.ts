import type { BufferState, ChatMessage } from '../../shared/protocol.js';

type BufferActivityFields = Pick<BufferState, 'unread' | 'priorityUnread'>;
type BufferReadCursorFields = Pick<BufferState, 'unread' | 'lastReadTs' | 'lastReadMessageId'>;
export type UnreadDividerAnchor = {
  bufferId: string;
  lastReadTs: number | null;
  lastReadMessageId: string | null;
};

export const hasUnreadBufferActivity = (buffer: BufferActivityFields | null | undefined) =>
  (buffer?.unread ?? 0) > 0 || (buffer?.priorityUnread ?? 0) > 0;

export const resolveBufferActivityState = (buffer: BufferActivityFields | null | undefined) => ({
  hasUnread: hasUnreadBufferActivity(buffer),
  priority: (buffer?.priorityUnread ?? 0) > 0,
});

export const shouldMarkSelectedBufferRead = (input: {
  selectedBuffer: BufferActivityFields | null;
  documentVisible: boolean;
  windowFocused: boolean;
}) =>
  !!input.selectedBuffer
  && hasUnreadBufferActivity(input.selectedBuffer)
  && input.documentVisible
  && input.windowFocused;

export const captureUnreadDividerAnchor = (
  buffer: (BufferActivityFields & Pick<BufferState, 'id' | 'lastReadTs' | 'lastReadMessageId'>) | null | undefined,
  previousAnchor: UnreadDividerAnchor | null,
): UnreadDividerAnchor | null => {
  if (!buffer) {
    return null;
  }
  if (hasUnreadBufferActivity(buffer)) {
    if (previousAnchor?.bufferId === buffer.id) {
      return previousAnchor;
    }
    return {
      bufferId: buffer.id,
      lastReadTs: buffer.lastReadTs,
      lastReadMessageId: buffer.lastReadMessageId,
    };
  }
  if (previousAnchor?.bufferId === buffer.id) {
    return previousAnchor;
  }
  return null;
};

const skipSelfAuthoredUnreadMessages = (
  messages: readonly ChatMessage[],
  startIndex: number,
) => {
  for (let index = startIndex; index < messages.length; index += 1) {
    if (!messages[index]!.self) {
      return index;
    }
  }
  return null;
};

export const resolveFirstUnreadDividerIndex = (
  messages: readonly ChatMessage[],
  buffer: BufferReadCursorFields | null | undefined,
) => {
  if (!buffer || buffer.unread <= 0 || messages.length === 0) {
    return null;
  }
  if (buffer.lastReadMessageId) {
    const cursorIndex = messages.findIndex((message) => message.id === buffer.lastReadMessageId);
    if (cursorIndex >= 0) {
      return skipSelfAuthoredUnreadMessages(messages, cursorIndex < messages.length - 1 ? cursorIndex + 1 : 0);
    }
  }
  if (buffer.lastReadTs == null) {
    return skipSelfAuthoredUnreadMessages(messages, 0);
  }
  let dividerIndex = 0;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]!.ts <= buffer.lastReadTs) {
      dividerIndex = index + 1;
      continue;
    }
    return skipSelfAuthoredUnreadMessages(messages, dividerIndex);
  }
  return skipSelfAuthoredUnreadMessages(messages, dividerIndex < messages.length ? dividerIndex : 0);
};

export const resolveVisibleUnreadDividerIndex = (
  messages: readonly ChatMessage[],
  buffer: (BufferActivityFields & Pick<BufferState, 'id' | 'lastReadTs' | 'lastReadMessageId'>) | null | undefined,
  anchor: UnreadDividerAnchor | null,
) => {
  if (!buffer) {
    return null;
  }
  if (anchor?.bufferId === buffer.id) {
    return resolveFirstUnreadDividerIndex(messages, {
      unread: 1,
      lastReadTs: anchor.lastReadTs,
      lastReadMessageId: anchor.lastReadMessageId,
    });
  }
  if (hasUnreadBufferActivity(buffer)) {
    return resolveFirstUnreadDividerIndex(messages, {
      unread: buffer.unread,
      lastReadTs: buffer.lastReadTs,
      lastReadMessageId: buffer.lastReadMessageId,
    });
  }
  return null;
};

export const resolveInitialTranscriptScrollTarget = (input: {
  buffer: BufferActivityFields | null | undefined;
  firstUnreadDividerIndex: number | null;
  listKind: 'chat' | 'server';
  messagesLength: number;
}) => {
  if (input.listKind === 'server') {
    return 'latest' as const;
  }
  if (input.firstUnreadDividerIndex !== null) {
    return 'first-unread' as const;
  }
  if (hasUnreadBufferActivity(input.buffer) && input.messagesLength === 0) {
    return 'wait' as const;
  }
  return 'latest' as const;
};
