import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol-chat.js';
import { initialState } from '../web/src/app-state.js';
import { createNetworkActions } from '../web/src/app-actions-networks.js';
import type { Action, State } from '../web/src/app-types.js';
import type { AppSessionSnapshot } from '../web/src/app-session.js';
import { buildConversationModel } from '../web/src/conversation-model.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const makeNetwork = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: overrides.id ?? 'saved-network-1',
  workspaceOpen: overrides.workspaceOpen ?? false,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  realName: overrides.realName ?? 'Sofia',
  hasPassword: overrides.hasPassword ?? false,
  authMethod: overrides.authMethod,
  authTarget: overrides.authTarget,
  authAccount: overrides.authAccount,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
  notes: overrides.notes ?? '',
});

const makePeer = (root: NetworkProfile, overrides: Partial<NetworkProfile> = {}): NetworkProfile =>
  makeNetwork({
    ...root,
    id: overrides.id ?? 'instance-1',
    workspaceOpen: overrides.workspaceOpen ?? true,
    ...overrides,
  });

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'server-buffer-1',
  networkId: overrides.networkId ?? 'instance-1',
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const emptyWorkspace: WorkspaceView = {
  mode: 'empty',
  selection: null,
  workspaceNetworks: [],
  selectedNetwork: null,
  selectedRuntime: null,
  selectedBuffer: null,
  selectedChannel: null,
  selectedPendingChannel: null,
  headerTitle: '',
  headerSubtitle: '',
  composerMode: 'hidden',
  composerPlaceholder: '',
  emptyBody: '',
  showNicklist: false,
};

const makeSession = ({
  networks,
  buffers = [],
  networkStates = {},
  workspace = emptyWorkspace,
}: {
  networks: NetworkProfile[];
  buffers?: BufferState[];
  networkStates?: State['domain']['networkStates'];
  workspace?: WorkspaceView;
}): AppSessionSnapshot => {
  const state: State = {
    ...initialState,
    domain: {
      ...initialState.domain,
      phase: 'ready',
      gatewayStatus: 'connected',
      networks,
      buffers,
      channels: [],
      pendingChannels: [],
      networkStates,
    },
    transient: initialState.transient,
  };

  return {
    conversation: buildConversationModel({
      buffers: state.domain.buffers,
      channels: state.domain.channels,
      pendingChannels: state.domain.pendingChannels,
    }),
    draft: '',
    state,
    workspace,
  };
};

const createHarness = (session: AppSessionSnapshot) => {
  const dispatched: Action[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const actions = createNetworkActions({
    applyServerMessages: () => {},
    dispatch: (action) => {
      dispatched.push(action);
    },
    getState: () => session.state,
    getWorkspace: () => session.workspace,
    updateBanner: (kind, message) => {
      banners.push({ kind, message });
    },
  });
  return { actions, banners, dispatched };
};

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;

test('connectNetwork opens an offline saved network directly', async () => {
  const saved = makeNetwork();
  const serverBuffer = makeBuffer({ id: 'server-buffer-offline', networkId: saved.id });
  const session = makeSession({
    networks: [saved],
    buffers: [serverBuffer],
    networkStates: { [saved.id]: { phase: 'offline', serverName: null, nick: saved.nick } },
  });
  const { actions, banners, dispatched } = createHarness(session);
  const fetchCalls: Array<{ url: string; method: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: String(init?.body ?? ''),
    });
    if (String(input) === `/api/networks/${saved.id}/connect`) {
      return okJson({ ok: true, network: { ...saved, workspaceOpen: true }, serverBuffer, messages: [] });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  try {
    const started = await actions.connectNetwork(saved);

    assert.equal(started, true);
    assert.deepEqual(fetchCalls, [{
      url: `/api/networks/${saved.id}/connect`,
      method: 'POST',
      body: '{}',
    }]);
    assert.deepEqual(banners, [{ kind: 'notice', message: 'Network opened' }]);
    assert.deepEqual(dispatched, [{ type: 'select', selection: { kind: 'buffer', bufferId: serverBuffer.id } }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('toggleCurrentChannelAutoJoin updates the selected saved network', async () => {
  const saved = makeNetwork({ id: 'saved-1', workspaceOpen: true, autoJoin: ['#ops'] });
  const channelBuffer = makeBuffer({ id: 'buffer-1', networkId: saved.id, kind: 'channel', target: '#help' });
  const selectedChannel: ChannelState = {
    id: channelBuffer.id,
    networkId: saved.id,
    name: '#help',
    topic: '',
    users: [],
  };
  const workspace: WorkspaceView = {
    mode: 'channel-connected',
    selection: { kind: 'buffer', bufferId: channelBuffer.id },
    workspaceNetworks: [saved],
    selectedNetwork: saved,
    selectedRuntime: { phase: 'connected', serverName: null, nick: saved.nick },
    selectedBuffer: channelBuffer,
    selectedChannel,
    selectedPendingChannel: null,
    headerTitle: selectedChannel.name,
    headerSubtitle: '',
    composerMode: 'normal',
    composerPlaceholder: 'Type a message or /command',
    emptyBody: '',
    showNicklist: true,
  };
  const session = makeSession({
    networks: [saved],
    buffers: [channelBuffer],
    workspace,
  });
  const { actions, banners } = createHarness(session);
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; method: string; autoJoin: string[] }> = [];
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      autoJoin: JSON.parse(String(init?.body ?? '{}')).autoJoin,
    });
    return okJson({
      messages: [],
      network: { ...saved, autoJoin: ['#ops', '#help'] },
      serverBuffer: null,
    });
  }) as typeof fetch;

  try {
    const enabled = await actions.toggleCurrentChannelAutoJoin();

    assert.equal(enabled, true);
    assert.deepEqual(fetchCalls, [{
      url: '/api/networks/saved-1',
      method: 'PUT',
      autoJoin: ['#ops', '#help'],
    }]);
    assert.deepEqual(banners, [{ kind: 'notice', message: 'Added #help to autojoin' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
