import assert from 'node:assert/strict';
import test from 'node:test';
import { initialChannelListState,initialState,reducer } from '../web/src/app-state.js';
import { indexConversationMessages,toConversationMessageKey } from '../web/src/conversation-message-state.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';
import { emptySnapshot, makeBuffer, makeFriend, makeMessage, makeNetwork, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

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
  const key = toConversationMessageKey(existing.networkId, existing.target);

  assert.deepEqual(
    nextState.domain.messages[key].map((message) => ({ id: message.id, body: message.body, ts: message.ts })),
    [
      { id: 'message-2', body: 'hello', ts: 5 },
      { id: 'message-1', body: 'hello', ts: 10 },
      { id: 'message-3', body: 'updated hello', ts: 20 },
    ]
  );
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
    nextState.domain.messages[toConversationMessageKey(keep.networkId, keep.target)],
    [keep]
  );
  assert.deepEqual(
    nextState.domain.messages[toConversationMessageKey(otherConversation.networkId, otherConversation.target)],
    [otherConversation]
  );
});

test('removing a buffer also removes its indexed messages', () => {
  const buffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#Help' });
  const state = makeState({
    domain: {
      buffers: [buffer],
      messages: indexConversationMessages([
        makeMessage({ id: 'message-1', target: '#help' }),
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

