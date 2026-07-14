import assert from 'node:assert/strict';
import test from 'node:test';
import { reducer } from '../web/src/app-state.js';
import {
  inactiveConversationMessageLimit,
  indexConversationMessages,
} from '../web/src/conversation-message-state.js';
import { makeBuffer, makeMessage, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

test('pending selections promote to the confirmed channel buffer', () => {
  const state = makeState({
    domain: {
      pendingChannels: [makePendingChannel({ networkId: 'network-1', channel: '#help' })],
    },
    transient: {
      selection: { kind: 'pending-channel', networkId: 'network-1', channel: '#help' },
    },
  });

  const nextState = reducer(state, {
    type: 'upsert-buffer',
    buffer: makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' }),
  });

  assert.deepEqual(nextState.transient.selection, { kind: 'buffer', bufferId: 'channel-1' });
});

test('append-messages merges batched updates in timestamp order per conversation', () => {
  const existing = makeMessage({ id: 'message-1', ts: 10 });
  const earlier = makeMessage({ id: 'message-2', ts: 5 });
  const later = makeMessage({ id: 'message-3', ts: 20 });
  const duplicateLater = makeMessage({ id: 'message-3', body: 'updated hello', ts: 20 });
  const state = makeState({
    domain: {
      messages: indexConversationMessages([existing]),
    },
  });

  const nextState = reducer(state, {
    type: 'append-messages',
    messages: [later, earlier, duplicateLater],
  });
  const key = existing.bufferId;

  assert.deepEqual(
    nextState.domain.messages[key].map((message) => ({ id: message.id, body: message.body, ts: message.ts })),
    [
      { id: 'message-2', body: 'hello', ts: 5 },
      { id: 'message-1', body: 'hello', ts: 10 },
      { id: 'message-3', body: 'updated hello', ts: 20 },
    ]
  );
});

test('live message appends retain only the newest browser message window', () => {
  const existingMessages = Array.from({ length: inactiveConversationMessageLimit }, (_, index) =>
    makeMessage({ id: `message-${index}`, ts: index })
  );
  const state = makeState({
    domain: {
      messages: indexConversationMessages(existingMessages),
    },
  });
  const nextLiveMessage = makeMessage({
    id: 'message-live-new',
    ts: inactiveConversationMessageLimit,
  });

  const nextState = reducer(state, {
    type: 'append-message',
    message: nextLiveMessage,
  });
  const key = nextLiveMessage.bufferId;
  const retained = nextState.domain.messages[key];

  assert.equal(retained.length, inactiveConversationMessageLimit);
  assert.equal(retained[0]?.id, 'message-1');
  assert.equal(retained.at(-1)?.id, nextLiveMessage.id);
});

test('manual history batches are capped by the retained message window', () => {
  const historyMessages = Array.from({ length: inactiveConversationMessageLimit + 1 }, (_, index) =>
    makeMessage({ id: `history-message-${index}`, ts: index })
  );

  const nextState = reducer(makeState(), {
    type: 'append-messages',
    messages: historyMessages,
  });
  const key = historyMessages[0]!.bufferId;
  const retained = nextState.domain.messages[key];

  assert.equal(retained.length, inactiveConversationMessageLimit);
  assert.equal(retained[0]?.id, 'history-message-1');
  assert.equal(retained.at(-1)?.id, `history-message-${inactiveConversationMessageLimit}`);
});

test('prepended history fills remaining capacity before older loading is disabled', () => {
  const currentMessages = Array.from({ length: inactiveConversationMessageLimit - 1 }, (_, index) =>
    makeMessage({ id: `current-message-${index}`, ts: index + 1 })
  );
  const olderMessage = makeMessage({ id: 'older-message', ts: 0 });
  const state = makeState({
    domain: {
      messages: indexConversationMessages(currentMessages),
    },
  });

  const nextState = reducer(state, {
    type: 'prepend-messages',
    messages: [olderMessage],
  });
  const retained = nextState.domain.messages[olderMessage.bufferId];

  assert.equal(retained.length, inactiveConversationMessageLimit);
  assert.equal(retained[0]?.id, olderMessage.id);
  assert.equal(retained.at(-1)?.id, `current-message-${inactiveConversationMessageLimit - 2}`);
});

test('remove-messages deletes only the requested conversation entries', () => {
  const keep = makeMessage({ id: 'message-1', target: '#Help', ts: 1 });
  const remove = makeMessage({ id: 'import:turn-1:0', target: '#help', ts: 2 });
  const otherConversation = makeMessage({ id: 'message-2', target: '#random', ts: 3 });
  const state = makeState({
    domain: {
      messages: indexConversationMessages([keep, remove, otherConversation]),
    },
  });

  const nextState = reducer(state, {
    type: 'remove-messages',
    networkId: keep.networkId,
    target: '#HELP',
    messageIds: [remove.id],
  });

  assert.deepEqual(
    nextState.domain.messages[keep.bufferId],
    [keep]
  );
  assert.deepEqual(
    nextState.domain.messages[otherConversation.bufferId],
    [otherConversation]
  );
});

test('retargeting a query buffer keeps its live transcript in the selected bucket', () => {
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'helper' });
  const state = makeState({
    domain: {
      buffers: [query],
      messages: indexConversationMessages([
        makeMessage({ id: 'message-1', bufferId: query.id, target: 'helper', body: 'before rename' }),
      ]),
    },
    transient: {
      selection: { kind: 'buffer', bufferId: query.id },
    },
  });

  const nextState = reducer(state, {
    type: 'upsert-buffer',
    buffer: { ...query, target: 'guide' },
  });

  assert.deepEqual(
    nextState.domain.messages[query.id]?.map((message) => ({
      bufferId: message.bufferId,
      target: message.target,
      body: message.body,
    })),
    [{ bufferId: query.id, target: 'guide', body: 'before rename' }],
  );
  assert.deepEqual(nextState.transient.selection, { kind: 'buffer', bufferId: query.id });
});

test('removing a merged query buffer moves live messages into the survivor bucket', () => {
  const survivor = makeBuffer({ id: 'query-1', kind: 'query', target: 'guide' });
  const removed = makeBuffer({ id: 'query-2', kind: 'query', target: 'helper' });
  const state = makeState({
    domain: {
      buffers: [survivor, removed],
      messages: indexConversationMessages([
        makeMessage({ id: 'old-message', bufferId: removed.id, target: 'helper', body: 'old window', ts: 1 }),
        makeMessage({ id: 'new-message', bufferId: survivor.id, target: 'guide', body: 'new window', ts: 2 }),
      ]),
    },
  });

  const nextState = reducer(state, {
    type: 'remove-buffer',
    networkId: survivor.networkId,
    bufferId: removed.id,
    replacementBufferId: survivor.id,
  });

  assert.equal(nextState.domain.messages[removed.id], undefined);
  assert.deepEqual(
    nextState.domain.messages[survivor.id]?.map((message) => ({
      id: message.id,
      bufferId: message.bufferId,
      target: message.target,
    })),
    [
      { id: 'old-message', bufferId: survivor.id, target: 'guide' },
      { id: 'new-message', bufferId: survivor.id, target: 'guide' },
    ],
  );
});

test('removing a buffer also removes its indexed messages', () => {
  const buffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#Help' });
  const state = makeState({
    domain: {
      buffers: [buffer],
      messages: indexConversationMessages([
        makeMessage({ id: 'message-1', bufferId: buffer.id, target: '#help' }),
      ]),
    },
  });

  const nextState = reducer(state, {
    type: 'remove-buffer',
    bufferId: buffer.id,
    networkId: buffer.networkId,
  });

  assert.deepEqual(nextState.domain.messages, {});
});
