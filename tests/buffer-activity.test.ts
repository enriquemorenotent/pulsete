import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChatMessage } from '../shared/protocol-chat.js';
import {
  captureUnreadDividerAnchor,
  resolveBufferActivityState,
  resolveFirstUnreadDividerIndex,
  resolveInitialTranscriptScrollTarget,
  resolveVisibleUnreadDividerIndex,
  shouldMarkSelectedBufferRead,
} from '../web/src/transcript/unread-state.js';

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
    { hasUnread: true, priority: true }
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

test('resolveFirstUnreadDividerIndex skips self-authored messages at the unread boundary', () => {
  const messages = [
    makeMessage({ id: 'message-1', ts: 1 }),
    makeMessage({ id: 'message-2', ts: 2, self: true }),
    makeMessage({ id: 'message-3', ts: 3 }),
  ];

  assert.equal(
    resolveFirstUnreadDividerIndex(messages, makeBuffer({
      unread: 1,
      lastReadMessageId: 'message-1',
    })),
    2
  );
});

test('resolveFirstUnreadDividerIndex hides the divider when only self-authored messages remain unread', () => {
  const messages = [
    makeMessage({ id: 'message-1', ts: 1 }),
    makeMessage({ id: 'message-2', ts: 2, self: true }),
  ];

  assert.equal(
    resolveFirstUnreadDividerIndex(messages, makeBuffer({
      unread: 1,
      lastReadMessageId: 'message-1',
    })),
    null
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

test('captureUnreadDividerAnchor keeps the original boundary while the same buffer stays active', () => {
  const anchor = captureUnreadDividerAnchor(makeBuffer({
    unread: 2,
    lastReadMessageId: 'message-1',
  }), null);

  assert.deepEqual(
    captureUnreadDividerAnchor(makeBuffer({
      unread: 1,
      lastReadMessageId: 'message-3',
    }), anchor),
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

test('resolveVisibleUnreadDividerIndex keeps the original unread boundary when new traffic arrives in the same open buffer', () => {
  const messages = [
    makeMessage({ id: 'message-1', ts: 1 }),
    makeMessage({ id: 'message-2', ts: 2 }),
    makeMessage({ id: 'message-3', ts: 3 }),
    makeMessage({ id: 'message-4', ts: 4 }),
  ];
  const anchor = captureUnreadDividerAnchor(makeBuffer({
    unread: 2,
    lastReadMessageId: 'message-1',
  }), null);

  assert.equal(
    resolveVisibleUnreadDividerIndex(messages, makeBuffer({
      unread: 1,
      lastReadMessageId: 'message-3',
    }), anchor),
    1
  );
});

test('resolveInitialTranscriptScrollTarget lands at the first unread divider when available', () => {
  assert.equal(
    resolveInitialTranscriptScrollTarget({
      buffer: makeBuffer({ unread: 3 }),
      firstUnreadDividerIndex: 5,
      listKind: 'chat',
      messagesLength: 12,
    }),
    'first-unread'
  );
});

test('resolveInitialTranscriptScrollTarget waits for unread history to load before positioning', () => {
  assert.equal(
    resolveInitialTranscriptScrollTarget({
      buffer: makeBuffer({ unread: 2 }),
      firstUnreadDividerIndex: null,
      listKind: 'chat',
      messagesLength: 0,
    }),
    'wait'
  );
});

test('resolveInitialTranscriptScrollTarget falls back to latest for server transcripts', () => {
  assert.equal(
    resolveInitialTranscriptScrollTarget({
      buffer: makeBuffer({ unread: 4 }),
      firstUnreadDividerIndex: 2,
      listKind: 'server',
      messagesLength: 9,
    }),
    'latest'
  );
});
