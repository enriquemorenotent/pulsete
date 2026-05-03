import assert from 'node:assert/strict';
import test from 'node:test';
import { listWorkspaceNetworks } from '../shared/network-model.js';
import type { NetworkProfile } from '../shared/protocol-chat.js';

const makeNetwork = (overrides: Partial<NetworkProfile>): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  workspaceOpen: overrides.workspaceOpen ?? true,
  name: overrides.name ?? 'Network',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'tester',
  altNicks: overrides.altNicks ?? [],
  realName: overrides.realName ?? 'Tester',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

test('workspace networks are open-only, favorites first, then alphabetic by name', () => {
  const networks = [
    makeNetwork({ id: 'zeta', name: 'Zeta' }),
    makeNetwork({ id: 'closed', workspaceOpen: false, name: 'A Closed', favorite: true }),
    makeNetwork({ id: 'beta-favorite', name: 'beta', favorite: true }),
    makeNetwork({ id: 'alpha', name: 'Alpha' }),
    makeNetwork({ id: 'alpha-favorite', name: 'alpha', favorite: true }),
  ];

  assert.deepEqual(
    listWorkspaceNetworks(networks).map((network) => network.id),
    ['alpha-favorite', 'beta-favorite', 'alpha', 'zeta'],
  );
});

test('workspace network ordering is stable for equal favorite and name values', () => {
  const networks = [
    makeNetwork({ id: 'network-b', name: 'Same' }),
    makeNetwork({ id: 'network-a', name: 'Same' }),
  ];

  assert.deepEqual(
    listWorkspaceNetworks(networks).map((network) => network.id),
    ['network-a', 'network-b'],
  );
  assert.deepEqual(networks.map((network) => network.id), ['network-b', 'network-a']);
});
