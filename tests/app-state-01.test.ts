import assert from 'node:assert/strict';
import test from 'node:test';
import { initialChannelListState,initialState,reducer } from '../web/src/app-state.js';
import { indexConversationMessages,toConversationMessageKey } from '../web/src/conversation-message-state.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';
import { emptySnapshot, makeBuffer, makeFriend, makeMessage, makeNetwork, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

test('snapshot enters the ready phase and clears any banner', () => {
  const dirtyState = makeState({
    transient: {
      banner: { kind: 'notice', message: 'Stale banner' },
      historyLoading: true,
    },
  });

  const nextState = reducer(dirtyState, {
    type: 'snapshot',
    snapshot: emptySnapshot(),
  });

  assert.equal(nextState.domain.phase, 'ready');
  assert.equal(nextState.transient.banner, null);
  assert.equal(nextState.transient.historyLoading, false);
  assert.equal(nextState.transient.selection, null);
});

test('snapshot selects the first instance server buffer', () => {
  const network = makeNetwork({ managerHidden: true });
  const buffer = makeBuffer({ networkId: network.id });

  const nextState = reducer(initialState, {
    type: 'snapshot',
    snapshot: {
      networks: [network],
      friends: [],
      friendPresence: {},
      buffers: [buffer],
      channels: [],
      pendingChannels: [],
      messages: [],
      networkStates: {
        [network.id]: {
          phase: 'connecting',
          serverName: null,
          nick: network.nick,
        },
      },
      assistant: initialState.domain.assistant,
    },
  });

  assert.deepEqual(nextState.transient.selection, { kind: 'buffer', bufferId: buffer.id });
  assert.deepEqual(nextState.domain.networkStates[network.id], {
    phase: 'connecting',
    serverName: null,
    nick: network.nick,
  });
});

test('snapshot replaces stale runtime messages and invalid pending selections', () => {
  const network = makeNetwork({ managerHidden: true });
  const serverBuffer = makeBuffer({ id: 'server-1', networkId: network.id });
  const staleMessage = makeMessage({ id: 'stale', body: 'stale', ts: 1 });
  const freshMessage = makeMessage({ id: 'fresh', body: 'fresh', ts: 2 });
  const state = makeState({
    domain: {
      phase: 'ready',
      networks: [network],
      buffers: [serverBuffer],
      pendingChannels: [makePendingChannel()],
      messages: indexConversationMessages([staleMessage]),
    },
    transient: {
      selection: { kind: 'pending-channel', networkId: network.id, channel: '#help' },
    },
  });

  const nextState = reducer(state, {
    type: 'snapshot',
    snapshot: {
      networks: [network],
      friends: [],
      friendPresence: {},
      buffers: [serverBuffer],
      channels: [],
      pendingChannels: [],
      messages: [freshMessage],
      networkStates: {
        [network.id]: {
          phase: 'connected',
          serverName: 'irc.libera.chat',
          nick: 'tester',
        },
      },
      assistant: initialState.domain.assistant,
    },
  });

  assert.deepEqual(nextState.domain.messages, indexConversationMessages([freshMessage]));
  assert.deepEqual(nextState.transient.selection, { kind: 'buffer', bufferId: serverBuffer.id });
});

test('friend updates are sorted alphabetically in state', () => {
  const withFriend = reducer(initialState, {
    type: 'upsert-friend',
    friend: makeFriend({ id: 'friend-2', nick: 'zoe' }),
  });

  const nextState = reducer(withFriend, {
    type: 'upsert-friend',
    friend: makeFriend({ id: 'friend-1', nick: 'Alice' }),
  });

  assert.deepEqual(nextState.domain.friends.map((friend) => friend.nick), ['Alice', 'zoe']);
});

test('friend presence updates track online state by friend id', () => {
  const friend = makeFriend({ id: 'friend-1', nick: 'Alice' });
  const withFriend = reducer(initialState, { type: 'upsert-friend', friend });
  const withPresence = reducer(withFriend, { type: 'friend-presence', friendId: friend.id, online: true });
  const withoutFriend = reducer(withPresence, { type: 'remove-friend', friendId: friend.id });

  assert.equal(withPresence.domain.friendPresence[friend.id], true);
  assert.equal(friend.id in withoutFriend.domain.friendPresence, false);
});

test('gateway transitions reset transport state and clear the reconnect banner once ready', () => {
  const network = makeNetwork({ id: 'network-1', managerHidden: true, nick: 'tester' });
  const loadingState = makeState({
    domain: {
      phase: 'ready',
      gatewayStatus: 'connected',
      networks: [network],
      pendingChannels: [makePendingChannel({ networkId: network.id })],
      networkStates: {
        [network.id]: {
          phase: 'connected',
          serverName: 'irc.libera.chat',
          nick: 'tester_live',
        },
      },
    },
    transient: {
      banner: { kind: 'error', message: gatewayReconnectMessage },
      channelList: {
        open: true,
        networkId: 'network-1',
        requestId: 'request-1',
        status: 'loading',
        entries: [{ name: '#help', users: 42, topic: 'Support' }],
        error: null,
      },
    },
  });

  const disconnected = reducer(loadingState, { type: 'gateway-disconnected' });
  const reconnecting = reducer(disconnected, { type: 'gateway-connecting' });
  const connected = reducer(reconnecting, { type: 'gateway-connected' });

  assert.equal(disconnected.domain.gatewayStatus, 'disconnected');
  assert.deepEqual(disconnected.transient.channelList, initialChannelListState);
  assert.deepEqual(disconnected.domain.pendingChannels, []);
  assert.deepEqual(disconnected.domain.networkStates[network.id], {
    phase: 'offline',
    serverName: null,
    nick: network.nick,
  });
  assert.equal(disconnected.transient.historyLoading, false);
  assert.equal(reconnecting.domain.gatewayStatus, 'connecting');
  assert.deepEqual(reconnecting.transient.channelList, initialChannelListState);
  assert.equal(connected.domain.gatewayStatus, 'connected');
  assert.equal(connected.transient.banner, null);
});

test('assistant thread load attempts reset on assistant snapshots', () => {
  const loading = reducer(initialState, {
    type: 'set-assistant-loading-thread',
    threadId: 'thread-1',
  });
  const settled = reducer(loading, {
    type: 'set-assistant-loading-thread',
    threadId: null,
  });
  const refreshed = reducer(settled, {
    type: 'assistant-snapshot',
    assistant: emptySnapshot().assistant,
  });

  assert.equal(loading.transient.assistant.attemptedThreadId, 'thread-1');
  assert.equal(settled.transient.assistant.attemptedThreadId, 'thread-1');
  assert.equal(refreshed.transient.assistant.attemptedThreadId, null);
});

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
