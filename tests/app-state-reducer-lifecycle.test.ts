import assert from 'node:assert/strict';
import test from 'node:test';
import { initialChannelListState,initialState,reducer } from '../web/src/app-state.js';
import { indexConversationMessages } from '../web/src/conversation-message-state.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';
import { emptySnapshot, makeBuffer, makeFriend, makeMessage, makeNetwork, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

test('snapshot enters the ready phase and clears any banner', () => {
  const dirtyState = makeState({
    transient: {
      banner: { kind: 'notice', message: 'Stale banner' },
    },
  });

  const nextState = reducer(dirtyState, {
    type: 'snapshot',
    snapshot: emptySnapshot(),
  });

  assert.equal(nextState.domain.phase, 'ready');
  assert.equal(nextState.transient.banner, null);
  assert.deepEqual(nextState.transient.historyLoadedByBufferId, {});
  assert.deepEqual(nextState.transient.historyHasOlderByBufferId, {});
  assert.equal(nextState.transient.selection, null);
});

test('snapshot selects the first instance server buffer', () => {
  const network = makeNetwork({ workspaceOpen: true });
  const buffer = makeBuffer({ networkId: network.id });

  const nextState = reducer(initialState, {
    type: 'snapshot',
    snapshot: {
      networks: [network],
      friends: [],
      nickEmojis: [],
      mutedNicks: [],
      friendPresence: {},
      queryPresence: {},
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
    },
  });

  assert.deepEqual(nextState.transient.selection, { kind: 'buffer', bufferId: buffer.id });
  assert.deepEqual(nextState.domain.networkStates[network.id], {
    phase: 'connecting',
    serverName: null,
    nick: network.nick,
    capabilities: { offered: [], negotiated: [], pending: [] },
  });
});

test('snapshot replaces stale runtime messages and invalid pending selections', () => {
  const network = makeNetwork({ workspaceOpen: true });
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
      nickEmojis: [],
      mutedNicks: [],
      friendPresence: {},
      queryPresence: {},
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

test('friend presence updates track status by friend id', () => {
  const friend = makeFriend({ id: 'friend-1', nick: 'Alice' });
  const withFriend = reducer(initialState, { type: 'upsert-friend', friend });
  const withPresence = reducer(withFriend, {
    type: 'friend-presence',
    friendId: friend.id,
    presence: 'away',
  });
  const withoutFriend = reducer(withPresence, { type: 'remove-friend', friendId: friend.id });

  assert.equal(withPresence.domain.friendPresence[friend.id], 'away');
  assert.equal(friend.id in withoutFriend.domain.friendPresence, false);
});

test('query presence updates track status by buffer id and clear on buffer removal', () => {
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'Alice' });
  const withBuffer = reducer(initialState, { type: 'upsert-buffer', buffer: query });
  const withPresence = reducer(withBuffer, {
    type: 'query-presence',
    bufferId: query.id,
    presence: 'online',
  });
  const withoutBuffer = reducer(withPresence, {
    type: 'remove-buffer',
    bufferId: query.id,
    networkId: query.networkId,
  });

  assert.equal(withPresence.domain.queryPresence[query.id], 'online');
  assert.equal(query.id in withoutBuffer.domain.queryPresence, false);
});

test('gateway transitions reset transport state and clear the reconnect banner once ready', () => {
  const network = makeNetwork({ id: 'network-1', workspaceOpen: true, nick: 'tester' });
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
        totalEntries: 1,
        truncated: false,
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
    capabilities: { offered: [], negotiated: [], pending: [] },
  });
  assert.deepEqual(disconnected.transient.historyLoadedByBufferId, {});
  assert.deepEqual(disconnected.transient.historyHasOlderByBufferId, {});
  assert.equal(reconnecting.domain.gatewayStatus, 'connecting');
  assert.deepEqual(reconnecting.transient.channelList, initialChannelListState);
  assert.equal(connected.domain.gatewayStatus, 'connected');
  assert.equal(connected.transient.banner, null);
});

test('history-buffer-loaded tracks pagination state per buffer', () => {
  const nextState = reducer(initialState, {
    type: 'history-buffer-loaded',
    bufferId: 'buffer-1',
    hasOlder: true,
  });

  assert.deepEqual(nextState.transient.historyLoadedByBufferId, { 'buffer-1': true });
  assert.deepEqual(nextState.transient.historyHasOlderByBufferId, { 'buffer-1': true });
});

test('append-messages keeps prepended pages ahead of equal-timestamp rows', () => {
  const state = makeState({
    domain: {
      messages: indexConversationMessages([
        makeMessage({ id: 'newer-1', target: '#help', body: 'newer 1', ts: 5 }),
        makeMessage({ id: 'newer-2', target: '#help', body: 'newer 2', ts: 5 }),
      ]),
    },
  });

  const nextState = reducer(state, {
    type: 'prepend-messages',
    messages: [
      makeMessage({ id: 'older-1', target: '#help', body: 'older 1', ts: 5 }),
      makeMessage({ id: 'older-2', target: '#help', body: 'older 2', ts: 5 }),
    ],
  });

  assert.deepEqual(
    nextState.domain.messages['network-1:#help']?.map((entry) => entry.id),
    ['older-1', 'older-2', 'newer-1', 'newer-2']
  );
});
