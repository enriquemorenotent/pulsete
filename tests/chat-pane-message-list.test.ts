import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChatTranscriptModel,
} from '../web/src/transcript/model.js';
import {
  resolveTranscriptVirtuosoItemKey,
  resolveTranscriptVirtuosoRow,
} from '../web/src/ChatTranscriptVirtuoso.js';
import {
  resolveFirstUnreadScrollLocation,
  resolveLatestFollowBehavior,
  resolveNextFirstItemIndex,
  resolvePrependedRowCountFromAnchor,
  resolveRestoredTranscriptScrollIndex,
} from '../web/src/transcript/viewport.js';

test('transcript model inserts an unread divider row before the first unread message', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: 1,
    listKind: 'chat',
    messages: [
      { id: 'message-1', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'older', kind: 'line', self: false, ts: 1 },
      { id: 'message-2', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'newer', kind: 'line', self: false, ts: 2 },
    ],
    mutedNicks: [],
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
      { id: 'message-1', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'late', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 0, 0).getTime() },
      { id: 'message-2', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'next day', kind: 'line', self: false, ts: new Date(2026, 2, 12, 0, 5, 0, 0).getTime() },
    ],
    mutedNicks: [],
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
      { id: 'message-1', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'first', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 1, 0).getTime() },
      { id: 'message-2', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'second', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 57, 40, 0).getTime() },
      { id: 'message-3', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Joby', body: 'third', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 58, 1, 0).getTime() },
      { id: 'message-4', bufferId: 'buffer-1', networkId: 'network-1', target: '#help', nick: 'Ava', body: 'fourth', kind: 'line', self: false, ts: new Date(2026, 2, 11, 2, 58, 20, 0).getTime() },
    ],
    mutedNicks: [],
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

test('server transcript model groups consecutive routine rows by source and tone', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'server',
    messages: [
      { id: 'message-1', bufferId: 'buffer-1', networkId: 'network-1', target: 'server', nick: null, body: 'Connected', kind: 'system', self: false, ts: 1 },
      { id: 'message-2', bufferId: 'buffer-1', networkId: 'network-1', target: 'server', nick: null, body: '* Welcome', kind: 'system', self: false, ts: 2 },
      { id: 'message-3', bufferId: 'buffer-1', networkId: 'network-1', target: 'server', nick: null, body: 'Maintenance soon', kind: 'notice', self: false, ts: 3 },
      { id: 'message-4', bufferId: 'buffer-1', networkId: 'network-1', target: 'server', nick: 'StatServ', body: '<VERSION>', kind: 'line', self: false, ts: 4 },
      { id: 'message-5', bufferId: 'buffer-1', networkId: 'network-1', target: 'server', nick: null, body: 'Connection failed', kind: 'error', self: false, ts: 5 },
    ],
    mutedNicks: [],
    unreadDividerKey: 'unused',
  });

  assert.deepEqual(
    model.flatRows.map((row) => {
      if (row.kind === 'server-group') {
        return `${row.sourceLabel}:${row.tone}:${row.messageRows.map((messageRow) => messageRow.message.id).join(',')}`;
      }
      return row.kind === 'message' ? row.message.id : row.kind;
    }),
    [
      'Server:system:message-1,message-2',
      'Notice:notice:message-3',
      'StatServ:system:message-4',
      'message-5',
    ],
  );
});

test('latest follow behavior autoscrolls only while pinned or after sending', () => {
  assert.equal(
    resolveLatestFollowBehavior({ atLatest: true, pendingSendToLatest: false }),
    'auto',
  );
  assert.equal(
    resolveLatestFollowBehavior({ atLatest: false, pendingSendToLatest: true }),
    'auto',
  );
  assert.equal(
    resolveLatestFollowBehavior({ atLatest: false, pendingSendToLatest: false }),
    false,
  );
});

test('transcript virtuoso maps grouped header and item indexes to stable keys', () => {
  const firstItemIndex = 1_000_000;
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      { id: 'message-1', bufferId: 'buffer-1', networkId: 'network-1', target: 'MissD', nick: 'sofia', body: 'How are you?', kind: 'line', self: true, ts: new Date(2026, 2, 11, 2, 57, 0, 0).getTime() },
    ],
    mutedNicks: [],
    unreadDividerKey: 'unused',
  });

  assert.deepEqual(model.groupCounts, [1]);
  assert.equal(
    resolveTranscriptVirtuosoItemKey(firstItemIndex, model, firstItemIndex),
    model.groups[0]?.key,
  );
  assert.equal(
    resolveTranscriptVirtuosoItemKey(firstItemIndex + 1, model, firstItemIndex),
    'message:message-1',
  );
});

test('transcript virtuoso resolves the first item row after a day header', () => {
  const firstItemIndex = 1_000_000;
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      { id: 'message-1', bufferId: 'buffer-1', networkId: 'network-1', target: 'MissD', nick: 'sofia', body: 'How are you?', kind: 'line', self: true, ts: new Date(2026, 2, 11, 2, 57, 0, 0).getTime() },
    ],
    mutedNicks: [],
    unreadDividerKey: 'unused',
  });

  const row = resolveTranscriptVirtuosoRow(firstItemIndex, model, firstItemIndex);

  assert.equal(row?.kind, 'message');
  assert.equal(row?.kind === 'message' ? row.message.body : null, 'How are you?');
});

test('first item index moves upward by the number of prepended transcript rows', () => {
  assert.equal(resolveNextFirstItemIndex(1_000_000, 25), 999_975);
  assert.equal(resolveNextFirstItemIndex(8, 20), 1);
});

test('prepended transcript row count is resolved from the previous first row anchor', () => {
  assert.equal(
    resolvePrependedRowCountFromAnchor('message:message-3', [
      'message:message-1',
      'unread-divider:buffer-1',
      'message:message-2',
      'message:message-3',
    ]),
    3,
  );
  assert.equal(
    resolvePrependedRowCountFromAnchor('message:missing', ['message:message-1']),
    null,
  );
});

test('first unread scroll location targets the upper quarter of the viewport', () => {
  assert.deepEqual(
    resolveFirstUnreadScrollLocation(12, 200),
    {
      align: 'start',
      behavior: 'auto',
      index: 12,
      offset: -50,
    },
  );
});

test('saved transcript scroll anchors restore by row key when still visible', () => {
  assert.deepEqual(
    resolveRestoredTranscriptScrollIndex({
      firstItemIndex: 1_000_000,
      rowKeys: ['message:message-1', 'message:message-2'],
      snapshot: { kind: 'anchor', rowKey: 'message:message-2' },
    }),
    {
      align: 'start',
      behavior: 'auto',
      index: 1_000_001,
    },
  );
  assert.equal(
    resolveRestoredTranscriptScrollIndex({
      firstItemIndex: 1_000_000,
      rowKeys: ['message:message-1'],
      snapshot: { kind: 'anchor', rowKey: 'message:missing' },
    }),
    null,
  );
});
