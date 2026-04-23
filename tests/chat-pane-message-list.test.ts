import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChatTranscriptModel,
} from '../web/src/chat-transcript-model.js';
import {
  resolveTranscriptVirtuosoItemKey,
} from '../web/src/ChatTranscriptVirtuoso.js';
import {
  resolveNextFirstItemIndex,
  resolveTranscriptFollowOutput,
  resolveUnreadScrollLocation,
} from '../web/src/useChatTranscriptViewport.js';

test('transcript model inserts an unread divider row before the first unread message', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: 1,
    listKind: 'chat',
    messages: [
      { id: 'message-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'older', kind: 'line', self: false, ts: 1 },
      { id: 'message-2', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'newer', kind: 'line', self: false, ts: 2 },
    ],
    unreadDividerKey: 'unread-divider:buffer-1',
  });

  assert.equal(model.unreadRowIndex, 1);
  assert.deepEqual(
    model.flatRows.map((row) => row.kind === 'message' ? row.message.id : row.key),
    ['message-1', 'unread-divider:buffer-1', 'message-2'],
  );
});

test('transcript model groups rows by local calendar day', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      { id: 'message-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'late', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 0, 0).getTime() },
      { id: 'message-2', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'next day', kind: 'line', self: false, ts: new Date(2026, 2, 12, 0, 5, 0, 0).getTime() },
    ],
    unreadDividerKey: 'unused',
  });

  assert.deepEqual(
    model.groups.map((group) => ({ key: group.key, label: group.label, rowCount: group.rows.length })),
    [
      { key: 'day-2026-03-11', label: '2026-03-11', rowCount: 1 },
      { key: 'day-2026-03-12', label: '2026-03-12', rowCount: 1 },
    ],
  );
});

test('transcript model hides compact timestamps only for consecutive rows from the same sender in the same minute', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      { id: 'message-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'first', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 1, 0).getTime() },
      { id: 'message-2', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'second', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 40, 0).getTime() },
      { id: 'message-3', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'third', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 58, 1, 0).getTime() },
      { id: 'message-4', networkId: 'network-1', target: '#help', nick: 'Ava', body: 'fourth', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 58, 20, 0).getTime() },
    ],
    unreadDividerKey: 'unused',
  });

  assert.deepEqual(
    model.flatRows
      .filter((row) => row.kind === 'message')
      .map((row) => ({ id: row.message.id, hideTimestamp: row.hideTimestamp })),
    [
      { id: 'message-1', hideTimestamp: false },
      { id: 'message-2', hideTimestamp: true },
      { id: 'message-3', hideTimestamp: false },
      { id: 'message-4', hideTimestamp: false },
    ],
  );
});

test('follow output autoscrolls while pinned or when a send-follow request is pending', () => {
  assert.equal(
    resolveTranscriptFollowOutput({ isAtBottom: true, pendingSendFollow: false }),
    'auto',
  );
  assert.equal(
    resolveTranscriptFollowOutput({ isAtBottom: false, pendingSendFollow: true }),
    'auto',
  );
  assert.equal(
    resolveTranscriptFollowOutput({ isAtBottom: false, pendingSendFollow: false }),
    false,
  );
});

test('transcript virtuoso falls back to an index key for group headers', () => {
  assert.equal(resolveTranscriptVirtuosoItemKey(17, undefined), 'group:17');
  assert.equal(
    resolveTranscriptVirtuosoItemKey(18, {
      kind: 'unread-divider',
      key: 'unread-divider:buffer-1',
    }),
    'unread-divider:buffer-1',
  );
});

test('first item index moves upward by the number of prepended transcript rows', () => {
  assert.equal(resolveNextFirstItemIndex(1_000_000, 25), 999_975);
  assert.equal(resolveNextFirstItemIndex(8, 20), 1);
});

test('unread scroll location targets the upper quarter of the viewport', () => {
  assert.deepEqual(
    resolveUnreadScrollLocation(12, 200),
    {
      align: 'start',
      behavior: 'auto',
      index: 12,
      offset: -50,
    },
  );
});
