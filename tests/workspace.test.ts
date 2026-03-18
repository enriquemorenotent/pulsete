import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChannelState, NetworkProfile, QueryBuffer } from '../shared/protocol.js';
import {
  canShowInstanceChildren,
  deriveWorkspace,
  selectDefaultBuffer,
  type NetworkRuntimeState,
  type SelectedBuffer,
} from '../web/src/workspace.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? true,
  name: overrides.name ?? 'OFTC',
  host: overrides.host ?? 'irc.oftc.net',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'dbugger',
  altNicks: overrides.altNicks ?? ['dbugger_', 'dbugger__'],
  username: overrides.username ?? 'dbugger',
  realName: overrides.realName ?? 'dbugger',
  password: overrides.password,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makeRuntime = (overrides: Partial<NetworkRuntimeState> = {}): NetworkRuntimeState => ({
  connected: overrides.connected ?? false,
  connecting: overrides.connecting ?? false,
  serverName: overrides.serverName ?? null,
  nick: overrides.nick ?? 'dbugger',
});

const makeChannel = (overrides: Partial<ChannelState> = {}): ChannelState => ({
  id: overrides.id ?? 'channel-1',
  networkId: overrides.networkId ?? 'network-1',
  name: overrides.name ?? '#help',
  topic: overrides.topic ?? '',
  unread: overrides.unread ?? 0,
  users: overrides.users ?? ['alice', 'bob'],
});

const makeQuery = (overrides: Partial<QueryBuffer> = {}): QueryBuffer => ({
  id: overrides.id ?? 'query-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? 'alice',
});

const derive = ({
  networks = [makeNetwork()],
  channels = [] as ChannelState[],
  queries = [] as QueryBuffer[],
  runtime = null as NetworkRuntimeState | null,
  selection = null as SelectedBuffer | null,
} = {}) =>
  deriveWorkspace({
    networks,
    channels,
    queries,
    selection,
    networkStates: runtime ? { [networks[0].id]: runtime } : {},
  });

test('default buffer picks the first open connection instance server', () => {
  const selection = selectDefaultBuffer({
    networks: [makeNetwork({ id: 'saved-template', managerHidden: false }), makeNetwork({ id: 'instance-1' })],
  });

  assert.deepEqual(selection, {
    networkId: 'instance-1',
    target: 'server',
    channelId: null,
  });
});

test('empty workspace hides message-oriented UI when no connection instance exists', () => {
  const workspace = derive({
    networks: [makeNetwork({ id: 'saved-template', managerHidden: false })],
  });

  assert.equal(workspace.mode, 'empty');
  assert.equal(workspace.selection, null);
  assert.equal(workspace.showNicklist, false);
  assert.equal(workspace.composerMode, 'hidden');
});

test('offline instance forces server buffer and hides child buffers', () => {
  const workspace = derive({
    channels: [makeChannel()],
    selection: { networkId: 'network-1', target: '#help', channelId: 'channel-1' },
  });

  assert.equal(workspace.mode, 'server-offline');
  assert.deepEqual(workspace.selection, {
    networkId: 'network-1',
    target: 'server',
    channelId: null,
  });
  assert.equal(canShowInstanceChildren(workspace.selectedRuntime), false);
});

test('connecting instance stays on the server buffer with no composer', () => {
  const workspace = derive({
    runtime: makeRuntime({ connecting: true }),
    selection: { networkId: 'network-1', target: '#help', channelId: 'channel-1' },
  });

  assert.equal(workspace.mode, 'server-connecting');
  assert.equal(workspace.composerMode, 'hidden');
  assert.equal(workspace.headerSubtitle, 'Connecting…');
});

test('connected server buffer is command-only and hides the nicklist', () => {
  const workspace = derive({
    runtime: makeRuntime({ connected: true, serverName: 'helix.oftc.net' }),
    selection: { networkId: 'network-1', target: 'server', channelId: null },
  });

  assert.equal(workspace.mode, 'server-connected');
  assert.equal(workspace.composerMode, 'commands');
  assert.equal(workspace.showNicklist, false);
});

test('connected channel shows the nicklist and normal composer', () => {
  const channel = makeChannel();
  const workspace = derive({
    runtime: makeRuntime({ connected: true }),
    channels: [channel],
    selection: { networkId: 'network-1', target: '#help', channelId: channel.id },
  });

  assert.equal(workspace.mode, 'channel-connected');
  assert.equal(workspace.selectedChannel?.name, '#help');
  assert.equal(workspace.showNicklist, true);
  assert.equal(workspace.composerMode, 'normal');
});

test('connected private message hides the nicklist but keeps the composer', () => {
  const query = makeQuery();
  const workspace = derive({
    runtime: makeRuntime({ connected: true }),
    queries: [query],
    selection: { networkId: 'network-1', target: query.target, channelId: null },
  });

  assert.equal(workspace.mode, 'query-connected');
  assert.equal(workspace.selectedQuery?.target, 'alice');
  assert.equal(workspace.showNicklist, false);
  assert.equal(workspace.composerMode, 'normal');
});
