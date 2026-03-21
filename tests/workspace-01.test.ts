import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState,ChannelState,ChannelUserState,NetworkProfile,PendingChannelState } from '../shared/protocol.js';
import {
  deriveWorkspace,
  getConnectionLabel,
  getConnectionLabelParts,
  getConnectionStatus,
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
  phase: overrides.phase ?? 'offline',
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

const makeUser = (nick: string, mode: ChannelUserState['mode'] = 'normal'): ChannelUserState => ({
  nick,
  mode,
});

const makeChannel = (overrides: Partial<ChannelState> = {}): ChannelState => ({
  id: overrides.id ?? 'channel-1',
  networkId: overrides.networkId ?? 'network-1',
  name: overrides.name ?? '#help',
  topic: overrides.topic ?? '',
  users: overrides.users ?? [makeUser('alice'), makeUser('bob')],
});

const bufferSelection = (bufferId: string): SelectedBuffer => ({ kind: 'buffer', bufferId });

const derive = ({
  networks = [makeNetwork()],
  buffers = [makeBuffer()],
  channels = [] as ChannelState[],
  pendingChannels = [] as PendingChannelState[],
  runtime = null as NetworkRuntimeState | null,
  selection = null as SelectedBuffer | null,
} = {}) =>
  deriveWorkspace({
    networks,
    buffers,
    channels,
    pendingChannels,
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
    kind: 'buffer',
    bufferId: 'server-instance',
  });
});

test('connection labels include the live runtime nick', () => {
  const network = makeNetwork({ name: 'Cuff-Link', nick: 'sofia' });

  assert.deepEqual(getConnectionLabelParts([network], network, makeRuntime({ nick: 'sofiaa' })), {
    name: 'Cuff-Link',
    nick: 'sofiaa',
    instanceIndex: null,
  });
  assert.equal(getConnectionLabel([network], network, makeRuntime({ nick: 'sofiaa' })), 'Cuff-Link (sofiaa)');
});

test('connection labels preserve an instance index when several peers share one template', () => {
  const first = makeNetwork({ id: 'instance-1', templateId: 'template-1', name: 'Cuff-Link', nick: 'sofia' });
  const second = makeNetwork({ id: 'instance-2', templateId: 'template-1', name: 'Cuff-Link', nick: 'sofia' });

  assert.deepEqual(getConnectionLabelParts([first, second], second, makeRuntime({ nick: 'sofiaa' })), {
    name: 'Cuff-Link',
    nick: 'sofiaa',
    instanceIndex: 2,
  });
  assert.equal(getConnectionLabel([first, second], second, makeRuntime({ nick: 'sofiaa' })), 'Cuff-Link (sofiaa, 2)');
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

test('offline channel stays selected in read-only mode', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const channelBuffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
  const workspace = derive({
    buffers: [serverBuffer, channelBuffer],
    channels: [makeChannel({ id: channelBuffer.id })],
    selection: bufferSelection(channelBuffer.id),
  });

  assert.equal(workspace.mode, 'channel-offline');
  assert.deepEqual(workspace.selection, bufferSelection(channelBuffer.id));
  assert.equal(workspace.selectedBuffer?.target, '#help');
  assert.equal(workspace.composerMode, 'hidden');
  assert.equal(workspace.showNicklist, false);
  assert.equal(getConnectionStatus(workspace.selectedRuntime), 'offline');
  assert.equal(workspace.headerTitle, '#help');
});

test('offline private message stays selected in read-only mode', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const queryBuffer = makeBuffer({ id: 'query-1', kind: 'query', target: 'alice' });
  const workspace = derive({
    buffers: [serverBuffer, queryBuffer],
    selection: bufferSelection(queryBuffer.id),
  });

  assert.equal(workspace.mode, 'query-offline');
  assert.deepEqual(workspace.selection, bufferSelection(queryBuffer.id));
  assert.equal(workspace.selectedBuffer?.target, 'alice');
  assert.equal(workspace.composerMode, 'hidden');
  assert.equal(workspace.showNicklist, false);
});

test('connecting instance keeps channels selected in read-only mode', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const channelBuffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
  const workspace = derive({
    runtime: makeRuntime({ phase: 'connecting' }),
    buffers: [serverBuffer, channelBuffer],
    selection: bufferSelection(channelBuffer.id),
  });

  assert.equal(workspace.mode, 'channel-connecting');
  assert.equal(workspace.composerMode, 'hidden');
  assert.equal(workspace.selectedBuffer?.target, '#help');
  assert.equal(workspace.headerTitle, '#help');
  assert.match(workspace.headerSubtitle, /Reconnecting/);
});

test('connecting instance keeps private messages selected in read-only mode', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const queryBuffer = makeBuffer({ id: 'query-1', kind: 'query', target: 'alice' });
  const workspace = derive({
    runtime: makeRuntime({ phase: 'connecting' }),
    buffers: [serverBuffer, queryBuffer],
    selection: bufferSelection(queryBuffer.id),
  });

  assert.equal(workspace.mode, 'query-connecting');
  assert.equal(workspace.composerMode, 'hidden');
  assert.equal(workspace.selectedBuffer?.target, 'alice');
  assert.equal(workspace.headerTitle, 'alice');
  assert.match(workspace.headerSubtitle, /Reconnecting/);
});

test('connected server buffer is command-only and hides the nicklist', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const workspace = derive({
    runtime: makeRuntime({ phase: 'connected', serverName: 'helix.oftc.net' }),
    buffers: [serverBuffer],
    selection: bufferSelection(serverBuffer.id),
  });

  assert.equal(workspace.mode, 'server-connected');
  assert.equal(workspace.composerMode, 'commands');
  assert.equal(workspace.showNicklist, false);
  assert.equal(workspace.headerTitle, '');
  assert.equal(workspace.headerSubtitle, 'dbugger @ helix.oftc.net');
});

test('connected channel shows the nicklist and normal composer', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const channelBuffer = makeBuffer({ id: 'channel-1', kind: 'channel', target: '#help' });
  const channel = makeChannel({ id: channelBuffer.id });
  const workspace = derive({
    runtime: makeRuntime({ phase: 'connected' }),
    buffers: [serverBuffer, channelBuffer],
    channels: [channel],
    selection: bufferSelection(channelBuffer.id),
  });

  assert.equal(workspace.mode, 'channel-connected');
  assert.equal(workspace.selectedChannel?.name, '#help');
  assert.equal(workspace.showNicklist, true);
  assert.equal(workspace.composerMode, 'normal');
});
