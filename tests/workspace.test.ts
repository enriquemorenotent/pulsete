import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
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
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

const makeRuntime = (overrides: Partial<NetworkRuntimeState> = {}): NetworkRuntimeState => ({
  connected: overrides.connected ?? false,
  connecting: overrides.connecting ?? false,
  serverName: overrides.serverName ?? null,
  nick: overrides.nick ?? 'dbugger',
});

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
});

const makeChannel = (overrides: Partial<ChannelState> = {}): ChannelState => ({
  id: overrides.id ?? 'channel-1',
  networkId: overrides.networkId ?? 'network-1',
  name: overrides.name ?? '#help',
  topic: overrides.topic ?? '',
  users: overrides.users ?? ['alice', 'bob'],
});

const derive = ({
  networks = [makeNetwork()],
  buffers = [makeBuffer()],
  channels = [] as ChannelState[],
  runtime = null as NetworkRuntimeState | null,
  selection = null as SelectedBuffer | null,
} = {}) =>
  deriveWorkspace({
    networks,
    buffers,
    channels,
    selection,
    networkStates: runtime ? { [networks[0].id]: runtime } : {},
  });

test('default buffer picks the first open connection instance server', () => {
  const instance = makeNetwork({ id: 'instance-1' });
  const selection = selectDefaultBuffer({
    networks: [makeNetwork({ id: 'saved-template', managerHidden: false }), instance],
    buffers: [makeBuffer({ id: 'server-instance', networkId: instance.id })],
  });

  assert.deepEqual(selection, {
    bufferId: 'server-instance',
  });
});

test('empty workspace hides message-oriented UI when no connection instance exists', () => {
  const workspace = derive({
    networks: [makeNetwork({ id: 'saved-template', managerHidden: false })],
    buffers: [],
  });

  assert.equal(workspace.mode, 'empty');
  assert.equal(workspace.selection, null);
  assert.equal(workspace.showNicklist, false);
  assert.equal(workspace.composerMode, 'hidden');
});

test('offline instance forces server buffer and hides child buffers', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const channelBuffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
  const workspace = derive({
    buffers: [serverBuffer, channelBuffer],
    channels: [makeChannel({ id: channelBuffer.id })],
    selection: { bufferId: channelBuffer.id },
  });

  assert.equal(workspace.mode, 'server-offline');
  assert.deepEqual(workspace.selection, {
    bufferId: serverBuffer.id,
  });
  assert.equal(canShowInstanceChildren(workspace.selectedRuntime), false);
});

test('connecting instance stays on the server buffer with no composer', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const channelBuffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
  const workspace = derive({
    runtime: makeRuntime({ connecting: true }),
    buffers: [serverBuffer, channelBuffer],
    selection: { bufferId: channelBuffer.id },
  });

  assert.equal(workspace.mode, 'server-connecting');
  assert.equal(workspace.composerMode, 'hidden');
  assert.equal(workspace.statusLabel, 'Connecting');
  assert.equal(workspace.headerSubtitle, '');
});

test('connected server buffer is command-only and hides the nicklist', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const workspace = derive({
    runtime: makeRuntime({ connected: true, serverName: 'helix.oftc.net' }),
    buffers: [serverBuffer],
    selection: { bufferId: serverBuffer.id },
  });

  assert.equal(workspace.mode, 'server-connected');
  assert.equal(workspace.composerMode, 'commands');
  assert.equal(workspace.showNicklist, false);
});

test('connected channel shows the nicklist and normal composer', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const channelBuffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
  const channel = makeChannel({ id: channelBuffer.id });
  const workspace = derive({
    runtime: makeRuntime({ connected: true }),
    buffers: [serverBuffer, channelBuffer],
    channels: [channel],
    selection: { bufferId: channelBuffer.id },
  });

  assert.equal(workspace.mode, 'channel-connected');
  assert.equal(workspace.selectedChannel?.name, '#help');
  assert.equal(workspace.showNicklist, true);
  assert.equal(workspace.composerMode, 'normal');
});

test('pending channels stay selectable before channel metadata arrives', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const channelBuffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
  const workspace = derive({
    runtime: makeRuntime({ connected: true }),
    buffers: [serverBuffer, channelBuffer],
    selection: { bufferId: channelBuffer.id },
  });

  assert.equal(workspace.mode, 'channel-pending');
  assert.equal(workspace.selectedBuffer?.target, '#help');
  assert.equal(workspace.showNicklist, false);
});

test('connected private message hides the nicklist but keeps the composer', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'alice' });
  const workspace = derive({
    runtime: makeRuntime({ connected: true }),
    buffers: [serverBuffer, query],
    selection: { bufferId: query.id },
  });

  assert.equal(workspace.mode, 'query-connected');
  assert.equal(workspace.selectedBuffer?.target, 'alice');
  assert.equal(workspace.showNicklist, false);
  assert.equal(workspace.composerMode, 'normal');
});
