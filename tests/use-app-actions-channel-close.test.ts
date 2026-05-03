import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol-chat.js';
import { initialState } from '../web/src/app-state.js';
import type { Action, State } from '../web/src/app-types.js';
import type { AppSessionSnapshot } from '../web/src/app-session.js';
import { buildConversationModel } from '../web/src/conversation-model.js';
import { createAppActions } from '../web/src/useAppActions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'tester',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
};

const selectedBuffer: BufferState = {
  id: 'buffer-1',
  networkId: network.id,
  kind: 'channel',
  target: '#general',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const selectedChannel: ChannelState = {
  id: selectedBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: '',
  users: [],
};

const workspace: WorkspaceView = {
  mode: 'channel-connected',
  selection: { kind: 'buffer', bufferId: selectedBuffer.id },
  workspaceNetworks: [network],
  selectedNetwork: network,
  selectedRuntime: { phase: 'connected', serverName: 'irc.example.test', nick: 'tester' },
  selectedBuffer,
  selectedChannel,
  selectedPendingChannel: null,
  headerTitle: '#general',
  headerSubtitle: '',
  composerMode: 'normal',
  composerPlaceholder: 'Message #general',
  emptyBody: '',
  showNicklist: true,
};

const makeState = (): State => ({
  ...initialState,
  domain: {
    ...initialState.domain,
    phase: 'ready',
    gatewayStatus: 'disconnected',
    networks: [network],
    buffers: [selectedBuffer],
    channels: [selectedChannel],
    pendingChannels: [],
    networkStates: {
      [network.id]: {
        phase: 'connected',
        serverName: 'irc.example.test',
        nick: 'tester',
      },
    },
  },
  transient: {
    ...initialState.transient,
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
  },
});

const createParams = (draft = '') => {
  const actions: Action[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const composerEntries: string[] = [];
  const draftCalls: Array<{ value: string; contextKey?: string | null }> = [];
  const state = makeState();
  const conversation = buildConversationModel({
    buffers: state.domain.buffers,
    channels: state.domain.channels,
    pendingChannels: state.domain.pendingChannels,
  });

  return {
    actions,
    banners,
    composerEntries,
    draftCalls,
    params: {
      session: {
        conversation,
        draft,
        state,
        workspace,
      } satisfies AppSessionSnapshot,
      dispatch: (action: Action) => {
        actions.push(action);
      },
      socketRef: { current: null },
      setDraft: (value: string, contextKey?: string | null) => {
        draftCalls.push({ value, contextKey });
      },
      recordComposerEntry: (value: string) => {
        composerEntries.push(value);
      },
      updateBanner: (kind: 'notice' | 'error', message: string) => {
        banners.push({ kind, message });
      },
    },
  };
};

const mockCloseChannelFetch = (fetchCalls: Array<{ url: string; method: string }> = []) =>
  (async (input, init) => {
    fetchCalls.push({ url: String(input), method: String(init?.method ?? 'GET') });
    return new Response(JSON.stringify({
      ok: true,
      buffer: selectedBuffer,
      messages: [{ type: 'buffer.remove', networkId: network.id, bufferId: selectedBuffer.id }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

test('closeChannel closes the channel through the buffer API without a gateway socket', async () => {
  const fetchCalls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockCloseChannelFetch(fetchCalls);
  const { params, actions: dispatched, banners } = createParams();
  const actions = createAppActions(params);

  try {
    await actions.closeChannel(network.id, '#general');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(fetchCalls, [{ url: '/api/buffers/buffer-1', method: 'DELETE' }]);
  assert.deepEqual(dispatched, [{ type: 'remove-buffer', networkId: network.id, bufferId: selectedBuffer.id }]);
  assert.deepEqual(banners, []);
});

test('sendComposer allows /close without a gateway socket', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockCloseChannelFetch();
  const { params, banners, composerEntries, draftCalls } = createParams('/close');
  const actions = createAppActions(params);

  try {
    assert.equal(await actions.sendComposer(), true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(draftCalls, [{ value: '', contextKey: selectedBuffer.id }]);
  assert.deepEqual(composerEntries, ['/close']);
  assert.deepEqual(banners, []);
});
