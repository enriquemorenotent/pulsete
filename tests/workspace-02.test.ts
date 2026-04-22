import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState,ChannelState,NetworkProfile,PendingChannelState } from '../shared/protocol.js';
import { buildConversationIndex } from '../web/src/conversation-selectors.js';
import {
  deriveWorkspace,
  type NetworkRuntimeState,
  type SelectedBuffer
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
  personaNote: overrides.personaNote ?? '',
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
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const makePendingChannel = (overrides: Partial<PendingChannelState> = {}): PendingChannelState => ({
  networkId: overrides.networkId ?? 'network-1',
  channel: overrides.channel ?? '#help',
});

const bufferSelection = (bufferId: string): SelectedBuffer => ({ kind: 'buffer', bufferId });
const pendingSelection = (networkId: string, channel: string): SelectedBuffer => ({
  kind: 'pending-channel',
  networkId,
  channel,
});

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
    conversation: buildConversationIndex({
      buffers,
      channels,
      pendingChannels,
      messages: {},
    }),
    selection,
    networkStates: runtime ? { [networks[0].id]: runtime } : {},
  });

test('pending channels stay selectable before the confirmed buffer exists', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const workspace = derive({
    runtime: makeRuntime({ phase: 'connected' }),
    buffers: [serverBuffer],
    pendingChannels: [makePendingChannel({ networkId: serverBuffer.networkId, channel: '#help' })],
    selection: pendingSelection(serverBuffer.networkId, '#help'),
  });

  assert.equal(workspace.mode, 'channel-pending');
  assert.equal(workspace.selectedPendingChannel?.channel, '#help');
  assert.equal(workspace.selectedBuffer, null);
  assert.equal(workspace.showNicklist, false);
});

test('pending channel selection ignores IRC casing', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const workspace = derive({
    runtime: makeRuntime({ phase: 'connected' }),
    buffers: [serverBuffer],
    pendingChannels: [makePendingChannel({ networkId: serverBuffer.networkId, channel: '#Help' })],
    selection: pendingSelection(serverBuffer.networkId, '#help'),
  });

  assert.equal(workspace.mode, 'channel-pending');
  assert.equal(workspace.selectedPendingChannel?.channel, '#Help');
  assert.deepEqual(workspace.selection, pendingSelection(serverBuffer.networkId, '#help'));
});

test('connected private message hides the nicklist but keeps the composer', () => {
  const serverBuffer = makeBuffer({ id: 'server-1' });
  const query = makeBuffer({ id: 'query-1', kind: 'query', target: 'alice' });
  const workspace = derive({
    runtime: makeRuntime({ phase: 'connected' }),
    buffers: [serverBuffer, query],
    selection: bufferSelection(query.id),
  });

  assert.equal(workspace.mode, 'query-connected');
  assert.equal(workspace.selectedBuffer?.target, 'alice');
  assert.equal(workspace.showNicklist, false);
  assert.equal(workspace.composerMode, 'normal');
});

test('connections without a server buffer stay in transitional server mode', () => {
  const network = makeNetwork({ id: 'network-1', managerHidden: true });
  const workspace = derive({
    networks: [network],
    buffers: [],
    runtime: makeRuntime({ phase: 'connecting' }),
  });

  assert.equal(workspace.mode, 'server-connecting');
  assert.equal(workspace.selectedNetwork?.id, network.id);
  assert.equal(workspace.selection, null);
  assert.match(workspace.emptyBody, /server buffer/i);
});
