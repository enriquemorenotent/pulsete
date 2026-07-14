import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol-chat.js';
import { reducer } from '../web/src/app-state.js';
import {
  globalConversationMessageLimit,
  inactiveConversationMessageLimit,
  indexConversationMessages,
  mutateConversationMessages,
  retainConversationMessageBudget,
  selectedConversationMessageLimit,
  type ConversationMessages,
} from '../web/src/conversation-message-state.js';
import { makeBuffer, makeMessage, makeState } from './helpers/app-state-test-helpers.js';

test('selected and inactive conversations use separate retention windows', () => {
  const selectedId = 'selected-buffer';
  const inactiveId = 'inactive-buffer';
  const messages = indexConversationMessages([
    ...makeMessages(selectedId, selectedConversationMessageLimit + 1, 0),
    ...makeMessages(inactiveId, inactiveConversationMessageLimit + 1, 10_000),
  ]);

  const retained = retainConversationMessageBudget(messages, selectedId);

  assert.equal(retained[selectedId]?.length, selectedConversationMessageLimit);
  assert.equal(retained[selectedId]?.[0]?.id, `${selectedId}-1`);
  assert.equal(retained[inactiveId]?.length, inactiveConversationMessageLimit);
  assert.equal(retained[inactiveId]?.[0]?.id, `${inactiveId}-1`);
});

test('global retention evicts the least recently active inactive bucket first', () => {
  const selectedId = 'selected-buffer';
  const oldId = 'old-buffer';
  const recentId = 'recent-buffer';
  const messages = indexConversationMessages([
    ...makeMessages(oldId, 3, 0),
    ...makeMessages(selectedId, 5, 100),
    ...makeMessages(recentId, 3, 200),
  ]);

  const retained = retainConversationMessageBudget(messages, selectedId, {
    selected: 4,
    inactive: 2,
    global: 6,
  });

  assert.equal(retained[selectedId]?.length, 4);
  assert.equal(retained[oldId], undefined);
  assert.equal(retained[recentId]?.length, 2);
});

test('changing selection shrinks the previous conversation to the inactive window', () => {
  const previous = makeBuffer({ id: 'previous-buffer', target: '#previous' });
  const next = makeBuffer({ id: 'next-buffer', target: '#next' });
  const state = makeState({
    domain: {
      buffers: [previous, next],
      messages: indexConversationMessages(makeMessages(
        previous.id,
        inactiveConversationMessageLimit + 25,
        0,
      )),
    },
    transient: {
      selection: { kind: 'buffer', bufferId: previous.id },
      historyLoadedByBufferId: { [previous.id]: true },
      historyHasOlderByBufferId: { [previous.id]: false },
    },
  });

  const selected = reducer(state, {
    type: 'select',
    selection: { kind: 'buffer', bufferId: next.id },
  });

  assert.equal(selected.domain.messages[previous.id]?.length, inactiveConversationMessageLimit);
  assert.equal(selected.transient.historyHasOlderByBufferId[previous.id], true);
  assert.deepEqual(selected.transient.selection, { kind: 'buffer', bufferId: next.id });
});

test('globally evicted conversations are eligible for history reload', () => {
  const selectedId = 'selected-buffer';
  const inactiveIds = Array.from({ length: 17 }, (_, index) => `inactive-${index}`);
  const oldestId = inactiveIds[0]!;
  const messages = indexConversationMessages([
    ...makeMessages(oldestId, inactiveConversationMessageLimit, 0),
    ...makeMessages(selectedId, selectedConversationMessageLimit, 1_000),
    ...inactiveIds.slice(1).flatMap((bufferId, index) => makeMessages(
      bufferId,
      inactiveConversationMessageLimit,
      2_000 + index * inactiveConversationMessageLimit,
    )),
  ]);
  const state = makeState({
    domain: { messages },
    transient: {
      selection: { kind: 'buffer', bufferId: selectedId },
      historyLoadedByBufferId: { [oldestId]: true },
      historyHasOlderByBufferId: { [oldestId]: false },
    },
  });

  const retained = reducer(state, { type: 'set-banner', banner: null });

  assert.equal(retained.domain.messages[oldestId], undefined);
  assert.equal(retained.transient.historyLoadedByBufferId[oldestId], undefined);
  assert.equal(retained.transient.historyHasOlderByBufferId[oldestId], undefined);
});

test('upsert replaces and reorders a message without duplicating its id', () => {
  const bufferId = 'buffer-1';
  const current = indexConversationMessages([
    makeMessage({ id: 'first', bufferId, ts: 1 }),
    makeMessage({ id: 'updated', bufferId, ts: 2 }),
    makeMessage({ id: 'last', bufferId, ts: 3 }),
  ]);

  const next = mutateConversationMessages(current, {
    kind: 'upsert',
    message: makeMessage({ id: 'updated', bufferId, body: 'edited', ts: 4 }),
  }, bufferId);

  assert.deepEqual(
    next[bufferId]?.map(({ id, body }) => ({ id, body })),
    [
      { id: 'first', body: 'hello' },
      { id: 'last', body: 'hello' },
      { id: 'updated', body: 'edited' },
    ],
  );
});

test('duplicate live appends replace the existing message', () => {
  const original = makeMessage({ id: 'same-id', body: 'original', ts: 1 });
  const updated = makeMessage({ id: original.id, body: 'updated', ts: 2 });
  const next = mutateConversationMessages(indexConversationMessages([original]), {
    kind: 'append',
    message: updated,
  }, original.bufferId);

  assert.deepEqual(next[original.bufferId], [updated]);
});

test('reordered upserts preserve stable order for equal timestamps', () => {
  const bufferId = 'buffer-1';
  const messages = ['a', 'b', 'e', 'd'].map((id, index) => makeMessage({
    id,
    bufferId,
    ts: index === 3 ? 4 : 2,
  }));
  const next = mutateConversationMessages(indexConversationMessages(messages), {
    kind: 'upsert',
    message: makeMessage({ id: 'b', bufferId, body: 'updated', ts: 4 }),
  }, bufferId);

  assert.deepEqual(next[bufferId]?.map(({ id }) => id), ['a', 'e', 'b', 'd']);
});

test('prepended history does not overwrite a live version of the same message', () => {
  const live = makeMessage({ id: 'same-id', body: 'live', ts: 2 });
  const older = makeMessage({ id: 'older', ts: 1 });
  const staleCopy = makeMessage({ id: live.id, body: 'stale', ts: 2 });

  const next = mutateConversationMessages(indexConversationMessages([live]), {
    kind: 'prepend-batch',
    messages: [older, staleCopy],
  }, live.bufferId);

  assert.deepEqual(next[live.bufferId]?.map(({ id, body }) => ({ id, body })), [
    { id: older.id, body: older.body },
    { id: live.id, body: live.body },
  ]);
});

test('merging query buffers reapplies the inactive conversation cap', () => {
  const survivor = makeBuffer({ id: 'survivor', kind: 'query', target: 'guide' });
  const removed = makeBuffer({ id: 'removed', kind: 'query', target: 'helper' });
  const messages = [
    ...makeMessages(removed.id, 200, 0),
    ...makeMessages(survivor.id, 200, 200),
  ];
  const state = makeState({
    domain: { buffers: [survivor, removed], messages: indexConversationMessages(messages) },
  });

  const merged = reducer(state, {
    type: 'remove-buffer',
    bufferId: removed.id,
    networkId: removed.networkId,
    replacementBufferId: survivor.id,
  });

  assert.equal(merged.domain.messages[removed.id], undefined);
  assert.equal(merged.domain.messages[survivor.id]?.length, inactiveConversationMessageLimit);
  assert.equal(merged.domain.messages[survivor.id]?.[0]?.ts, 150);
  assert.equal(merged.domain.messages[survivor.id]?.at(-1)?.ts, 399);
});

test('a 100,000 message replay stays inside all browser retention budgets', () => {
  const bufferIds = Array.from({ length: 20 }, (_, index) => `buffer-${index}`);
  const selectedId = bufferIds[0]!;
  let messages: ConversationMessages = {};
  for (let index = 0; index < 100_000; index += 1) {
    const bufferId = bufferIds[index % bufferIds.length]!;
    messages = mutateConversationMessages(messages, {
      kind: 'append',
      message: makeMessage({ id: `message-${index}`, bufferId, ts: index }),
    }, selectedId);
    messages = retainConversationMessageBudget(messages, selectedId);
  }

  const total = Object.values(messages).reduce((sum, bucket) => sum + bucket.length, 0);
  assert.ok(total <= globalConversationMessageLimit);
  assert.ok((messages[selectedId]?.length ?? 0) <= selectedConversationMessageLimit);
  for (const [bufferId, bucket] of Object.entries(messages)) {
    if (bufferId !== selectedId) {
      assert.ok(bucket.length <= inactiveConversationMessageLimit);
    }
  }
});

const makeMessages = (
  bufferId: string,
  count: number,
  timestampOffset: number,
): ChatMessage[] => Array.from({ length: count }, (_, index) => makeMessage({
  id: `${bufferId}-${index}`,
  bufferId,
  target: bufferId,
  ts: timestampOffset + index,
}));
