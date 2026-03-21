import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppSnapshot,BufferState,ChatMessage,FriendState,NetworkProfile,PendingChannelState } from '../shared/protocol.js';
import { initialChannelListState,initialState,reducer } from '../web/src/app-state.js';
import type { State } from '../web/src/app-types.js';
import { indexConversationMessages } from '../web/src/conversation-message-state.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? false,
  name: overrides.name ?? 'Libera.Chat',
  host: overrides.host ?? 'irc.libera.chat',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'tester',
  altNicks: overrides.altNicks ?? ['tester_', 'tester__'],
  username: overrides.username ?? 'tester',
  realName: overrides.realName ?? 'tester',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
});

const makeFriend = (overrides: Partial<FriendState> = {}): FriendState => ({
  id: overrides.id ?? 'friend-1',
  nick: overrides.nick ?? 'alice',
});

const makePendingChannel = (overrides: Partial<PendingChannelState> = {}): PendingChannelState => ({
  networkId: overrides.networkId ?? 'network-1',
  channel: overrides.channel ?? '#help',
});

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: overrides.id ?? 'message-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#help',
  nick: overrides.nick ?? 'alice',
  body: overrides.body ?? 'hello',
  kind: overrides.kind ?? 'line',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

const emptySnapshot = (): AppSnapshot => ({
  networks: [],
  friends: [],
  friendPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: [],
  networkStates: {},
});

test('snapshot enters the ready phase and clears any banner', () => {
  const dirtyState = {
    ...initialState,
    banner: { kind: 'notice' as const, message: 'Stale banner' },
    historyLoading: true,
  };

  const nextState = reducer(dirtyState, {
    type: 'snapshot',
    snapshot: emptySnapshot(),
  });

  assert.equal(nextState.phase, 'ready');
  assert.equal(nextState.banner, null);
  assert.equal(nextState.historyLoading, false);
  assert.equal(nextState.selection, null);
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
    },
  });

  assert.deepEqual(nextState.selection, { kind: 'buffer', bufferId: buffer.id });
  assert.deepEqual(nextState.networkStates[network.id], {
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
  const state = {
    ...initialState,
    phase: 'ready' as const,
    networks: [network],
    buffers: [serverBuffer],
    pendingChannels: [makePendingChannel()],
    messages: indexConversationMessages([staleMessage]),
    selection: { kind: 'pending-channel' as const, networkId: network.id, channel: '#help' },
  };

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
    },
  });

  assert.deepEqual(nextState.messages, indexConversationMessages([freshMessage]));
  assert.deepEqual(nextState.selection, { kind: 'buffer', bufferId: serverBuffer.id });
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

  assert.deepEqual(nextState.friends.map((friend) => friend.nick), ['Alice', 'zoe']);
});

test('friend presence updates track online state by friend id', () => {
  const friend = makeFriend({ id: 'friend-1', nick: 'Alice' });
  const withFriend = reducer(initialState, { type: 'upsert-friend', friend });
  const withPresence = reducer(withFriend, { type: 'friend-presence', friendId: friend.id, online: true });
  const withoutFriend = reducer(withPresence, { type: 'remove-friend', friendId: friend.id });

  assert.equal(withPresence.friendPresence[friend.id], true);
  assert.equal(friend.id in withoutFriend.friendPresence, false);
});

test('gateway transitions reset transport state and clear the reconnect banner once ready', () => {
  const network = makeNetwork({ id: 'network-1', managerHidden: true, nick: 'tester' });
  const loadingState: State = {
    ...initialState,
    phase: 'ready' as const,
    gatewayStatus: 'connected' as const,
    networks: [network],
    pendingChannels: [makePendingChannel({ networkId: network.id })],
    networkStates: {
      [network.id]: {
        phase: 'connected',
        serverName: 'irc.libera.chat',
        nick: 'tester_live',
      },
    },
    banner: { kind: 'error' as const, message: gatewayReconnectMessage },
    channelList: {
      open: true,
      networkId: 'network-1',
      requestId: 'request-1',
      status: 'loading' as const,
      entries: [{ name: '#help', users: 42, topic: 'Support' }],
      error: null,
    },
  };

  const disconnected = reducer(loadingState, { type: 'gateway-disconnected' });
  const reconnecting = reducer(disconnected, { type: 'gateway-connecting' });
  const connected = reducer(reconnecting, { type: 'gateway-connected' });

  assert.equal(disconnected.gatewayStatus, 'disconnected');
  assert.deepEqual(disconnected.channelList, initialChannelListState);
  assert.deepEqual(disconnected.pendingChannels, []);
  assert.deepEqual(disconnected.networkStates[network.id], {
    phase: 'offline',
    serverName: null,
    nick: network.nick,
  });
  assert.equal(disconnected.historyLoading, false);
  assert.equal(reconnecting.gatewayStatus, 'connecting');
  assert.deepEqual(reconnecting.channelList, initialChannelListState);
  assert.equal(connected.gatewayStatus, 'connected');
  assert.equal(connected.banner, null);
});

test('pending selections promote to the confirmed channel buffer', () => {
  const state = {
    ...initialState,
    pendingChannels: [makePendingChannel({ networkId: 'network-1', channel: '#help' })],
    selection: { kind: 'pending-channel' as const, networkId: 'network-1', channel: '#help' },
  };

  const nextState = reducer(state, {
    type: 'upsert-buffer',
    buffer: makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' }),
  });

  assert.deepEqual(nextState.selection, { kind: 'buffer', bufferId: 'channel-1' });
});
