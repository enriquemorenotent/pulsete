import assert from 'node:assert/strict';
import test from 'node:test';
import { reducer } from '../web/src/app-state.js';
import { indexConversationMessages } from '../web/src/conversation-message-state.js';
import { dispatchInboundServerMessage } from '../web/src/server-message-actions.js';
import type { Action } from '../web/src/app-types.js';
import { makeBuffer, makeMessage, makeState } from './helpers/app-state-test-helpers.js';

test('pin mutation messages update loaded transcripts and the local pin cache', () => {
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'Alice' });
  const message = makeMessage({
    id: 'message-1',
    bufferId: query.id,
    target: query.target,
  });
  const state = makeState({
    domain: {
      buffers: [query],
      messages: indexConversationMessages([message]),
    },
    transient: {
      selection: { kind: 'buffer', bufferId: query.id },
    },
  });
  const pinned = { ...message, pinnedAt: 100 };
  const actions: Action[] = [];
  dispatchInboundServerMessage(
    { type: 'message.pin.updated', message: pinned },
    (action) => actions.push(action),
  );

  const pinnedState = reducer(state, actions[0]!);
  assert.equal(pinnedState.domain.messages[query.id]?.[0]?.pinnedAt, 100);
  assert.deepEqual(pinnedState.domain.pinnedMessages[query.id], [pinned]);

  const unpinnedState = reducer(pinnedState, {
    type: 'message-pin-updated',
    message: { ...message, pinnedAt: undefined },
  });
  assert.equal(unpinnedState.domain.messages[query.id]?.[0]?.pinnedAt, undefined);
  assert.equal(unpinnedState.domain.pinnedMessages[query.id], undefined);
});

test('opening a pin replaces the transcript without merging disjoint live messages', () => {
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'Alice' });
  const latest = makeMessage({ id: 'latest', bufferId: query.id, target: query.target, ts: 100 });
  const historical = makeMessage({ id: 'historical', bufferId: query.id, target: query.target, ts: 10 });
  const state = makeState({
    domain: {
      buffers: [query],
      messages: indexConversationMessages([latest]),
    },
    transient: {
      selection: { kind: 'buffer', bufferId: query.id },
    },
  });

  const centered = reducer(state, {
    type: 'replace-message-window',
    bufferId: query.id,
    messages: [historical],
    hasOlder: true,
    hasNewer: true,
    focusMessageId: historical.id,
    focusRequestId: 7,
  });
  assert.deepEqual(centered.domain.messages[query.id], [historical]);
  assert.equal(centered.transient.historyHasOlderByBufferId[query.id], true);
  assert.equal(centered.transient.historyHasNewerByBufferId[query.id], true);
  assert.deepEqual(centered.transient.messageFocusRequest, {
    bufferId: query.id,
    messageId: historical.id,
    requestId: 7,
  });

  const incoming = makeMessage({ id: 'incoming', bufferId: query.id, target: query.target, ts: 101 });
  const suppressed = reducer(centered, { type: 'append-message', message: incoming });
  assert.deepEqual(suppressed.domain.messages[query.id], [historical]);

  const returned = reducer(suppressed, {
    type: 'replace-message-window',
    bufferId: query.id,
    messages: [latest, incoming],
    hasOlder: true,
    hasNewer: false,
  });
  assert.deepEqual(returned.domain.messages[query.id], [latest, incoming]);
  assert.equal(returned.transient.historyHasNewerByBufferId[query.id], false);
  assert.equal(returned.transient.messageFocusRequest, null);
});

test('clearing message ids also removes matching pins from client state', () => {
  const message = makeMessage({ id: 'pinned', pinnedAt: 10 });
  const state = makeState({
    domain: {
      messages: indexConversationMessages([message]),
      pinnedMessages: indexConversationMessages([message]),
    },
  });

  const next = reducer(state, {
    type: 'remove-messages',
    networkId: message.networkId,
    target: message.target,
    bufferId: message.bufferId,
    messageIds: [message.id],
  });

  assert.equal(next.domain.messages[message.bufferId], undefined);
  assert.equal(next.domain.pinnedMessages[message.bufferId], undefined);
});
