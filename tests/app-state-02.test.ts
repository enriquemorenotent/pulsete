import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState,NetworkProfile,PendingChannelState } from '../shared/protocol.js';
import { initialChannelListState,initialState,reducer } from '../web/src/app-state.js';
import type { State } from '../web/src/app-types.js';
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

const makePendingChannel = (overrides: Partial<PendingChannelState> = {}): PendingChannelState => ({
  networkId: overrides.networkId ?? 'network-1',
  channel: overrides.channel ?? '#help',
});

const makeState = (overrides: {
  domain?: Partial<State['domain']>;
  transient?: Partial<State['transient']>;
} = {}): State => ({
  ...initialState,
  domain: {
    ...initialState.domain,
    ...overrides.domain,
  },
  transient: {
    ...initialState.transient,
    ...overrides.transient,
  },
});

test('removing a pending channel falls back to the same network server buffer', () => {
  const serverBuffer = makeBuffer({ id: 'server-1', kind: 'server' });
  const state = makeState({
    domain: {
      networks: [makeNetwork({ id: 'network-1', managerHidden: true })],
      buffers: [serverBuffer],
      pendingChannels: [makePendingChannel({ networkId: 'network-1', channel: '#help' })],
    },
    transient: {
      selection: { kind: 'pending-channel', networkId: 'network-1', channel: '#help' },
    },
  });

  const nextState = reducer(state, {
    type: 'remove-pending-channel',
    networkId: 'network-1',
    channel: '#help',
  });

  assert.deepEqual(nextState.transient.selection, { kind: 'buffer', bufferId: serverBuffer.id });
});

test('channel list resets when the gateway drops, its network disconnects, or the network is removed', () => {
  const connectedState = makeState({
    domain: {
      phase: 'ready',
      networks: [makeNetwork({ id: 'network-1', managerHidden: true })],
      buffers: [makeBuffer({ networkId: 'network-1' })],
    },
    transient: {
      historyLoading: true,
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

  const gatewayDisconnected = reducer(connectedState, { type: 'gateway-disconnected' });
  const disconnected = reducer(connectedState, {
    type: 'network-state',
    networkId: 'network-1',
    phase: 'offline',
    serverName: null,
    nick: 'tester',
  });
  const removed = reducer(connectedState, { type: 'remove-network', networkId: 'network-1' });

  assert.deepEqual(gatewayDisconnected.transient.channelList, initialChannelListState);
  assert.deepEqual(disconnected.transient.channelList, initialChannelListState);
  assert.deepEqual(removed.transient.channelList, initialChannelListState);
  assert.equal(gatewayDisconnected.transient.historyLoading, false);
  assert.equal(removed.transient.historyLoading, false);
});

test('presence updates match channel names case-insensitively', () => {
  const channel = {
    id: 'channel-1',
    networkId: 'network-1',
    name: '#Help',
    topic: '',
    users: [],
  };

  const nextState = reducer(
    makeState({
      domain: {
        channels: [channel],
      },
    }),
    {
      type: 'update-presence',
      networkId: 'network-1',
      channel: '#help',
      users: [{ nick: 'Alice', mode: 'voice' }],
    }
  );

  assert.deepEqual(nextState.domain.channels[0]?.users, [{ nick: 'Alice', mode: 'voice' }]);
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
