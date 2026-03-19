import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppSnapshot, BufferState, FriendState, NetworkProfile } from '../shared/protocol.js';
import { initialState, reducer } from '../web/src/app-state.js';
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
  buffers: [],
  channels: [],
  messages: [],
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
      buffers: [buffer],
      channels: [],
      messages: [],
    },
  });

  assert.deepEqual(nextState.selection, { bufferId: buffer.id });
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

test('load-failed still exits the loading phase', () => {
  const nextState = reducer(initialState, { type: 'load-failed' });

  assert.equal(nextState.phase, 'ready');
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
