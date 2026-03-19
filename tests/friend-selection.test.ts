import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, NetworkProfile } from '../shared/protocol.js';
import { resolveFriendSelection } from '../web/src/friend-selection.js';
import type { NetworkRuntimeState } from '../web/src/workspace.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? true,
  name: overrides.name ?? 'Libera.Chat',
  host: overrides.host ?? 'irc.libera.chat',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'tester',
  altNicks: overrides.altNicks ?? ['tester_', 'tester__'],
  username: overrides.username ?? 'tester',
  realName: overrides.realName ?? 'Tester Example',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'query',
  target: overrides.target ?? 'alice',
  unread: overrides.unread ?? 0,
});

const connected: NetworkRuntimeState = {
  connected: true,
  connecting: false,
  serverName: 'irc.example.test',
  nick: 'tester',
};

const offline: NetworkRuntimeState = {
  connected: false,
  connecting: false,
  serverName: null,
  nick: 'tester',
};

test('friend selection prefers the selected connected network', () => {
  const network = makeNetwork();

  const decision = resolveFriendSelection({
    nick: 'alice',
    buffers: [],
    workspace: {
      connectionInstances: [network],
      selectedNetwork: network,
    },
    networkStates: { [network.id]: connected },
  });

  assert.deepEqual(decision, { type: 'open', network });
});

test('friend selection prefers an existing pm on the selected connected network', () => {
  const network = makeNetwork();
  const buffer = makeBuffer({ networkId: network.id, target: 'Alice' });

  const decision = resolveFriendSelection({
    nick: 'alice',
    buffers: [buffer],
    workspace: {
      connectionInstances: [network],
      selectedNetwork: network,
    },
    networkStates: { [network.id]: connected },
  });

  assert.deepEqual(decision, { type: 'select', buffer });
});

test('friend selection falls back to an existing pm on another connected network before opening a new one', () => {
  const selected = makeNetwork({ id: 'network-1', name: 'Selected' });
  const fallback = makeNetwork({ id: 'network-2', name: 'Fallback' });
  const buffer = makeBuffer({ id: 'buffer-2', networkId: fallback.id, target: 'alice' });

  const decision = resolveFriendSelection({
    nick: 'alice',
    buffers: [buffer],
    workspace: {
      connectionInstances: [selected, fallback],
      selectedNetwork: selected,
    },
    networkStates: { [selected.id]: offline, [fallback.id]: connected },
  });

  assert.deepEqual(decision, { type: 'select', buffer });
});

test('friend selection falls back to the first connected instance when no pm is open', () => {
  const selected = makeNetwork({ id: 'network-1', name: 'Selected' });
  const fallback = makeNetwork({ id: 'network-2', name: 'Fallback' });

  const decision = resolveFriendSelection({
    nick: 'alice',
    buffers: [],
    workspace: {
      connectionInstances: [selected, fallback],
      selectedNetwork: selected,
    },
    networkStates: { [selected.id]: offline, [fallback.id]: connected },
  });

  assert.deepEqual(decision, { type: 'open', network: fallback });
});

test('friend selection errors when no network is connected', () => {
  const network = makeNetwork();

  const decision = resolveFriendSelection({
    nick: 'alice',
    buffers: [],
    workspace: {
      connectionInstances: [network],
      selectedNetwork: network,
    },
    networkStates: { [network.id]: offline },
  });

  assert.deepEqual(decision, {
    type: 'error',
    message: 'Connect a network before opening a friend conversation',
  });
});
