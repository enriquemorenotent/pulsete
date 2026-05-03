import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage, MutedNickState } from '../shared/protocol-chat.js';
import { buildChatTranscriptModel, pruneExpandedMutedGroupKeys } from '../web/src/transcript/model.js';
import {
  resolveMutedAwareUnreadDividerIndex,
} from '../web/src/transcript/unread-state.js';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: overrides.id ?? 'message-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#help',
  nick: overrides.nick === undefined ? 'Joby' : overrides.nick,
  body: overrides.body ?? 'hello',
  kind: overrides.kind ?? 'line',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

const mutedNick = (nick: string): MutedNickState => ({
  id: `mute-${nick.toLowerCase()}`,
  networkId: 'network-1',
  nick,
});

test('transcript model collapses consecutive muted messages from the same nick', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      makeMessage({ id: 'message-1', nick: 'missd', body: 'first' }),
      makeMessage({ id: 'message-2', nick: 'MissD', body: 'second', ts: 2 }),
      makeMessage({ id: 'message-3', nick: 'Joby', body: 'visible', ts: 3 }),
    ],
    mutedNicks: [mutedNick('MissD')],
    unreadDividerKey: 'unused',
  });

  const mutedRow = model.flatRows[0];
  assert.equal(mutedRow?.kind, 'muted-group');
  assert.equal(mutedRow?.kind === 'muted-group' ? mutedRow.messageCount : null, 2);
  assert.equal(mutedRow?.kind === 'muted-group' ? mutedRow.nick : null, 'MissD');
  assert.deepEqual(
    mutedRow?.kind === 'muted-group' ? mutedRow.messageRows.map((row) => row.message.id) : [],
    ['message-1', 'message-2'],
  );
  assert.deepEqual(model.flatRows.map((row) => row.kind), ['muted-group', 'message']);
});

test('transcript model splits muted groups by nick and visible rows', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      makeMessage({ id: 'message-1', nick: 'MissD' }),
      makeMessage({ id: 'message-2', nick: 'Ava', ts: 2 }),
      makeMessage({ id: 'message-3', nick: 'Joby', ts: 3 }),
      makeMessage({ id: 'message-4', nick: 'MissD', ts: 4 }),
    ],
    mutedNicks: [mutedNick('MissD'), mutedNick('Ava')],
    unreadDividerKey: 'unused',
  });

  assert.deepEqual(
    model.flatRows.map((row) => row.kind === 'muted-group' ? `muted:${row.nick}` : row.kind),
    ['muted:MissD', 'muted:Ava', 'message', 'muted:MissD'],
  );
});

test('transcript model does not group muted rows across day or unread dividers', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: 1,
    listKind: 'chat',
    messages: [
      makeMessage({ id: 'message-1', nick: 'MissD', ts: new Date(2026, 2, 11, 23, 59, 0, 0).getTime() }),
      makeMessage({ id: 'message-2', nick: 'MissD', ts: new Date(2026, 2, 12, 0, 1, 0, 0).getTime() }),
    ],
    mutedNicks: [mutedNick('MissD')],
    unreadDividerKey: 'unread-divider:buffer-1',
  });

  assert.deepEqual(
    model.flatRows.map((row) => row.kind === 'muted-group' ? row.messageRows[0]?.message.id : row.key),
    ['message-1', 'unread-divider:buffer-1', 'message-2'],
  );
  assert.deepEqual(model.groupCounts, [1, 2]);
});

test('visible rows after a muted group keep their own timestamp boundary', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      makeMessage({ id: 'message-1', nick: 'Ava', ts: new Date(2026, 2, 11, 2, 57, 1, 0).getTime() }),
      makeMessage({ id: 'message-2', nick: 'MissD', ts: new Date(2026, 2, 11, 2, 57, 20, 0).getTime() }),
      makeMessage({ id: 'message-3', nick: 'Ava', ts: new Date(2026, 2, 11, 2, 57, 40, 0).getTime() }),
    ],
    mutedNicks: [mutedNick('MissD')],
    unreadDividerKey: 'unused',
  });

  assert.deepEqual(
    model.flatRows
      .filter((row) => row.kind === 'message')
      .map((row) => ({ id: row.message.id, hideTimestamp: row.hideTimestamp })),
    [
      { id: 'message-1', hideTimestamp: false },
      { id: 'message-3', hideTimestamp: false },
    ],
  );
});

test('muted messages do not become the unread divider target', () => {
  const messages = [
    makeMessage({ id: 'message-1', nick: 'MissD' }),
    makeMessage({ id: 'message-2', nick: 'Joby', ts: 2 }),
    makeMessage({ id: 'message-3', nick: 'sofia', self: true, ts: 3 }),
  ];

  assert.equal(
    resolveMutedAwareUnreadDividerIndex(0, messages, [mutedNick('MissD')]),
    1,
  );
  assert.equal(
    resolveMutedAwareUnreadDividerIndex(2, messages, [mutedNick('MissD')]),
    null,
  );
});

test('expanded muted group keys are pruned to visible transcript groups', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [
      makeMessage({ id: 'message-1', nick: 'MissD' }),
      makeMessage({ id: 'message-2', nick: 'Joby', ts: 2 }),
    ],
    mutedNicks: [mutedNick('MissD')],
    unreadDividerKey: 'unused',
  });
  const visibleMutedGroupKey = model.flatRows.find((row) => row.kind === 'muted-group')?.key;
  assert.ok(visibleMutedGroupKey);

  const pruned = pruneExpandedMutedGroupKeys(
    new Set([visibleMutedGroupKey, 'muted-group:stale']),
    model,
  );

  assert.deepEqual([...pruned], [visibleMutedGroupKey]);
});

test('expanded muted group pruning preserves the same set when nothing changed', () => {
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [makeMessage({ id: 'message-1', nick: 'MissD' })],
    mutedNicks: [mutedNick('MissD')],
    unreadDividerKey: 'unused',
  });
  const visibleMutedGroupKey = model.flatRows.find((row) => row.kind === 'muted-group')?.key;
  assert.ok(visibleMutedGroupKey);
  const current = new Set([visibleMutedGroupKey]);

  assert.equal(pruneExpandedMutedGroupKeys(current, model), current);
});
