import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChatMessage } from '../shared/protocol.js';
import {
  captureUnreadDividerAnchor,
  resolveBufferActivityState,
  resolveFirstUnreadDividerIndex,
  resolveVisibleUnreadDividerIndex,
  shouldMarkSelectedBufferRead,
} from '../web/src/buffer-activity.js';

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'channel',
  target: overrides.target ?? '#help',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: overrides.id ?? 'message-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#help',
  nick: overrides.nick ?? 'alice',
  body: overrides.body ?? 'hello',
  kind: overrides.kind ?? 'line',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

test('resolveBufferActivityState exposes priority when present', () => {
  assert.deepEqual(
    resolveBufferActivityState(makeBuffer({ unread: 3, priorityUnread: 1 })),
    { count: 3, hasUnread: true, priority: true }
  );
});

test('shouldMarkSelectedBufferRead waits for focus and visibility', () => {
  assert.equal(
    shouldMarkSelectedBufferRead({
      selectedBuffer: makeBuffer({ unread: 1 }),
      documentVisible: false,
      windowFocused: true,
    }),
    false
  );
  assert.equal(
    shouldMarkSelectedBufferRead({
      selectedBuffer: makeBuffer({ unread: 1 }),
      documentVisible: true,
      windowFocused: true,
    }),
    true
  );
});

test('resolveFirstUnreadDividerIndex uses the stored read message cursor when available', () => {
  const messages = [
    makeMessage({ id: 'message-1', ts: 1 }),
    makeMessage({ id: 'message-2', ts: 2 }),
    makeMessage({ id: 'message-3', ts: 3 }),
  ];

  assert.equal(
    resolveFirstUnreadDividerIndex(messages, makeBuffer({
      unread: 2,
      lastReadMessageId: 'message-1',
    })),
    1
  );
});

test('resolveFirstUnreadDividerIndex falls back to the top when the cursor is outside the loaded window', () => {
  const messages = [
    makeMessage({ id: 'message-2', ts: 2 }),
    makeMessage({ id: 'message-3', ts: 3 }),
  ];

  assert.equal(
    resolveFirstUnreadDividerIndex(messages, makeBuffer({
      unread: 2,
      lastReadMessageId: 'message-1',
      lastReadTs: 1,
    })),
    0
  );
});

test('captureUnreadDividerAnchor preserves the unread boundary after the buffer is marked read', () => {
  const unreadBuffer = makeBuffer({
    unread: 2,
    lastReadMessageId: 'message-1',
  });
  const anchor = captureUnreadDividerAnchor(unreadBuffer, null);

  assert.deepEqual(anchor, {
    bufferId: unreadBuffer.id,
    lastReadTs: null,
    lastReadMessageId: 'message-1',
  });
  assert.deepEqual(
    captureUnreadDividerAnchor(makeBuffer({ id: unreadBuffer.id, unread: 0 }), anchor),
    anchor
  );
});

test('resolveVisibleUnreadDividerIndex keeps showing the divider for the current open buffer after read clear', () => {
  const messages = [
    makeMessage({ id: 'message-1', ts: 1 }),
    makeMessage({ id: 'message-2', ts: 2 }),
  ];
  const unreadBuffer = makeBuffer({
    unread: 1,
    lastReadMessageId: 'message-1',
  });
  const anchor = captureUnreadDividerAnchor(unreadBuffer, null);

  assert.equal(
    resolveVisibleUnreadDividerIndex(messages, makeBuffer({
      id: unreadBuffer.id,
      unread: 0,
      lastReadTs: null,
      lastReadMessageId: null,
    }), anchor),
    1
  );
});
