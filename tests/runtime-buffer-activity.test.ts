import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol.js';
import { resolveNextBufferActivity, shouldIncrementPriorityUnread } from '../server/runtime-buffer-activity.js';
import type { MessageInput } from '../server/storage-types.js';

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

const makeMessage = (overrides: Partial<MessageInput> = {}): MessageInput => ({
  id: overrides.id ?? 'message-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#help',
  nick: overrides.nick ?? 'alice',
  body: overrides.body ?? 'hello tester',
  kind: overrides.kind ?? 'line',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

test('channel mentions increment generic and priority unread', () => {
  const next = resolveNextBufferActivity({
    buffer: makeBuffer({ unread: 2, priorityUnread: 1 }),
    message: makeMessage(),
    currentNick: 'tester',
    altNicks: ['tester_'],
  });

  assert.equal(next.unread, 3);
  assert.equal(next.priorityUnread, 2);
});

test('plain channel traffic stays generic unread only', () => {
  const next = resolveNextBufferActivity({
    buffer: makeBuffer(),
    message: makeMessage({ body: 'hello everyone' }),
    currentNick: 'tester',
    altNicks: ['tester_'],
  });

  assert.equal(next.unread, 1);
  assert.equal(next.priorityUnread, 0);
});

test('private messages are always priority unread when incoming', () => {
  assert.equal(
    shouldIncrementPriorityUnread({
      buffer: makeBuffer({ kind: 'query', target: 'alice' }),
      message: makeMessage({ target: 'alice', body: 'hi there' }),
      currentNick: 'tester',
      altNicks: ['tester_'],
    }),
    true
  );
});

test('server traffic never increments priority unread', () => {
  assert.equal(
    shouldIncrementPriorityUnread({
      buffer: makeBuffer({ kind: 'server', target: 'server' }),
      message: makeMessage({ target: 'server', body: 'tester: welcome' }),
      currentNick: 'tester',
      altNicks: ['tester_'],
    }),
    false
  );
});

test('muted messages do not increment unread or priority unread', () => {
  const next = resolveNextBufferActivity({
    buffer: makeBuffer({ kind: 'query', target: 'alice', unread: 2, priorityUnread: 1 }),
    message: makeMessage({ target: 'alice', body: 'hi there' }),
    currentNick: 'tester',
    altNicks: ['tester_'],
    messageMuted: true,
  });

  assert.equal(next.unread, 2);
  assert.equal(next.priorityUnread, 1);
});
