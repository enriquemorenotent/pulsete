import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppSnapshot, NetworkProfile } from '../shared/protocol.js';
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

const emptySnapshot = (): AppSnapshot => ({
  user: { id: 'user-1', username: 'tester' },
  networks: [],
  channels: [],
  queries: [],
  messages: [],
  activeNetworkId: null,
  activeBuffer: 'server',
  bootstrapped: true,
});

test('session-loaded clears auth state when returning to login', () => {
  const dirtyState = {
    ...initialState,
    authForm: { username: 'tester', password: 'secret' },
    banner: { kind: 'notice' as const, message: 'Signed out' },
  };

  const nextState = reducer(dirtyState, {
    type: 'session-loaded',
    session: { bootstrapped: true, authenticated: false },
  });

  assert.equal(nextState.phase, 'login');
  assert.deepEqual(nextState.authForm, { username: '', password: '' });
  assert.equal(nextState.banner, null);
});

test('session-loaded clears auth state after a successful login', () => {
  const dirtyState = {
    ...initialState,
    authForm: { username: 'tester', password: 'secret' },
  };

  const nextState = reducer(dirtyState, {
    type: 'session-loaded',
    session: {
      bootstrapped: true,
      authenticated: true,
      user: { id: 'user-1', username: 'tester' },
      snapshot: emptySnapshot(),
    },
  });

  assert.equal(nextState.phase, 'ready');
  assert.deepEqual(nextState.authForm, { username: '', password: '' });
  assert.equal(nextState.banner, null);
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
