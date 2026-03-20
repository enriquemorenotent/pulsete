import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppSnapshot, BufferState, FriendState, NetworkProfile } from '../shared/protocol.js';
import { initialState, reducer } from '../web/src/app-state.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';
import { resolveManagedNetworkId } from '../web/src/network-manager-state.js';

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

const emptySnapshot = (): AppSnapshot => ({
  networks: [],
  friends: [],
  friendPresence: {},
  buffers: [],
  channels: [],
  messages: [],
  networkStates: {},
});

test('snapshot-loaded enters the ready phase and clears any banner', () => {
  const dirtyState = {
    ...initialState,
    banner: { kind: 'notice' as const, message: 'Stale banner' },
  };

  const nextState = reducer(dirtyState, {
    type: 'snapshot-loaded',
    snapshot: emptySnapshot(),
  });

  assert.equal(nextState.phase, 'ready');
  assert.equal(nextState.banner, null);
  assert.equal(nextState.selection, null);
});

test('snapshot-loaded selects the first instance server buffer', () => {
  const network = makeNetwork({ managerHidden: true });
  const buffer = makeBuffer({ networkId: network.id });

  const nextState = reducer(initialState, {
    type: 'snapshot-loaded',
    snapshot: {
      networks: [network],
      friends: [],
      friendPresence: {},
      buffers: [buffer],
      channels: [],
      messages: [],
      networkStates: {
        [network.id]: {
          connected: false,
          connecting: true,
          serverName: null,
          nick: network.nick,
        },
      },
    },
  });

  assert.deepEqual(nextState.selection, { bufferId: buffer.id });
  assert.deepEqual(nextState.networkStates[network.id], {
    connected: false,
    connecting: true,
    serverName: null,
    nick: network.nick,
  });
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

test('load-failed still exits the loading phase', () => {
  const nextState = reducer(initialState, { type: 'load-failed' });

  assert.equal(nextState.phase, 'ready');
});

test('gateway transitions reset transport-scoped state and clear the reconnect banner once ready', () => {
  const loadingState = {
    ...initialState,
    gatewayStatus: 'connected' as const,
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
  assert.deepEqual(disconnected.channelList, initialState.channelList);
  assert.equal(reconnecting.gatewayStatus, 'connecting');
  assert.deepEqual(reconnecting.channelList, initialState.channelList);
  assert.equal(connected.gatewayStatus, 'connected');
  assert.equal(connected.banner, null);
});

test('channel list accumulates live entries and ignores stale request ids', () => {
  const opened = reducer(initialState, { type: 'open-channel-list', networkId: 'network-1' });
  const started = reducer(opened, { type: 'channel-list-started', networkId: 'network-1', requestId: 'request-1' });
  const withEntry = reducer(started, {
    type: 'channel-list-entry',
    networkId: 'network-1',
    requestId: 'request-1',
    entry: { name: '#help', users: 42, topic: 'Support' },
  });
  const ignored = reducer(withEntry, {
    type: 'channel-list-entry',
    networkId: 'network-1',
    requestId: 'request-2',
    entry: { name: '#ops', users: 12, topic: 'Ops' },
  });
  const completed = reducer(ignored, { type: 'channel-list-completed', networkId: 'network-1', requestId: 'request-1' });

  assert.equal(completed.channelList.open, true);
  assert.equal(completed.channelList.status, 'ready');
  assert.equal(completed.channelList.requestId, 'request-1');
  assert.deepEqual(completed.channelList.entries, [{ name: '#help', users: 42, topic: 'Support' }]);
});

test('channel list resets when the gateway drops, its network disconnects, or the network is removed', () => {
  const connectedState = {
    ...initialState,
    networks: [makeNetwork({ id: 'network-1', managerHidden: true })],
    buffers: [makeBuffer({ networkId: 'network-1' })],
    channelList: {
      open: true,
      networkId: 'network-1',
      requestId: 'request-1',
      status: 'loading' as const,
      entries: [{ name: '#help', users: 42, topic: 'Support' }],
      error: null,
    },
  };

  const gatewayDisconnected = reducer(connectedState, { type: 'gateway-disconnected' });
  const disconnected = reducer(connectedState, {
    type: 'network-state',
    networkId: 'network-1',
    connected: false,
    serverName: null,
    nick: 'tester',
  });
  const removed = reducer(connectedState, { type: 'remove-network', networkId: 'network-1' });

  assert.deepEqual(gatewayDisconnected.channelList, initialState.channelList);
  assert.deepEqual(disconnected.channelList, initialState.channelList);
  assert.deepEqual(removed.channelList, initialState.channelList);
});

test('resolveManagedNetworkId keeps a hidden selection while favorites are filtered', () => {
  const nonFavorite = makeNetwork({ id: 'network-1', name: 'IRCnet', favorite: false });
  const favorite = makeNetwork({ id: 'network-2', name: 'Libera.Chat', favorite: true });

  const managedNetworkId = resolveManagedNetworkId({
    phase: 'ready',
    managerNetworks: [nonFavorite, favorite],
    visibleNetworks: [favorite],
    managedNetworkId: nonFavorite.id,
  });

  assert.equal(managedNetworkId, nonFavorite.id);
});
