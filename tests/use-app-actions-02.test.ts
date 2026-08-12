import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol-chat.js';
import type { ClientMessage } from '../shared/protocol-messages.js';
import { initialState } from '../web/src/app-state.js';
import type { Action, State } from '../web/src/app-types.js';
import type { AppSessionSnapshot } from './helpers/app-actions-test-session.js';
import type { SocketHandle } from '../web/src/client.js';
import { buildConversationModel } from '../web/src/conversation-model.js';
import { gatewayReconnectMessage } from '../web/src/gateway.js';
import { createAppActionsForTest as createAppActions } from './helpers/app-actions-test-session.js';
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

const makeState = (overrides: {
  domain?: Partial<State['domain']>;
  transient?: Partial<State['transient']>;
} = {}): State => ({
  ...initialState,
  domain: {
    ...initialState.domain,
    phase: 'ready',
    gatewayStatus: 'connected',
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
    ...overrides.domain,
  },
  transient: {
    ...initialState.transient,
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    ...overrides.transient,
  },
});

const createParams = (options: { draft?: string; state?: State; socket?: SocketHandle | null }) => {
  const actions: Action[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const composerEntries: string[] = [];
  const composerEntryCalls: Array<{ value: string; contextKey?: string | null }> = [];
  const draftCalls: Array<{ value: string; contextKey?: string | null }> = [];
  const state = options.state ?? makeState();
  const conversation = buildConversationModel({
    buffers: state.domain.buffers,
    channels: state.domain.channels,
    pendingChannels: state.domain.pendingChannels,
  });

  return {
    actions,
    banners,
    composerEntries,
    composerEntryCalls,
    draftCalls,
    params: {
      session: {
        conversation,
        draft: options.draft ?? '',
        state,
        workspace,
      } satisfies AppSessionSnapshot,
      dispatch: (action: Action) => {
        actions.push(action);
      },
      socketRef: { current: options.socket ?? null },
      setDraft: (value: string, contextKey?: string | null) => {
        draftCalls.push({ value, contextKey });
      },
      recordComposerEntry: (value: string, contextKey?: string | null) => {
        composerEntries.push(value);
        composerEntryCalls.push({ value, contextKey });
      },
      updateBanner: (kind: 'notice' | 'error', message: string) => {
        banners.push({ kind, message });
      },
    },
  };
};

test('closeChannelList still clears local state while the gateway is unavailable', () => {
  const { params, actions: dispatched, banners } = createParams({
    state: makeState({
      domain: {
        gatewayStatus: 'disconnected',
      },
      transient: {
        channelList: {
          open: true,
          networkId: network.id,
          requestId: 'request-1',
          status: 'loading',
          entries: [],
          totalEntries: null,
          truncated: false,
          error: null,
        },
      },
    }),
  });
  const actions = createAppActions(params);

  actions.closeChannelList();

  assert.deepEqual(dispatched, [{ type: 'close-channel-list' }]);
  assert.deepEqual(banners, []);
});

test('sendComposer blocks websocket-backed sends while the gateway is reconnecting', async () => {
  const sent: ClientMessage[] = [];
  const { params, composerEntries, banners } = createParams({
    draft: 'hello',
    state: makeState({
      domain: {
        gatewayStatus: 'connecting',
      },
    }),
    socket: {
      send(message) {
        sent.push(message);
      },
      close() {},
    },
  });
  const actions = createAppActions(params);

  assert.equal(await actions.sendComposer(), false);

  assert.deepEqual(sent, []);
  assert.deepEqual(composerEntries, []);
  assert.deepEqual(banners, [{ kind: 'error', message: gatewayReconnectMessage }]);
});

test('sendComposer reports success for a sent message and records it in history', async () => {
  const sent: ClientMessage[] = [];
  const { params, composerEntries, composerEntryCalls, draftCalls, banners } = createParams({
    draft: 'hello',
    socket: {
      send(message) {
        sent.push(message);
      },
      close() {},
    },
  });
  const actions = createAppActions(params);

  assert.equal(await actions.sendComposer(), true);

  assert.deepEqual(sent, [
    {
      type: 'message.send',
      networkId: network.id,
      target: selectedBuffer.target,
      body: 'hello',
      kind: 'message',
      sourceBufferId: selectedBuffer.id,
    },
  ]);
  assert.deepEqual(composerEntries, ['hello']);
  assert.deepEqual(composerEntryCalls, [
    { value: 'hello', contextKey: selectedBuffer.id },
  ]);
  assert.deepEqual(draftCalls, [{ value: '', contextKey: selectedBuffer.id }]);
  assert.deepEqual(banners, []);
});

test('requestWhois sends a raw WHOIS command through the gateway', () => {
  const sent: ClientMessage[] = [];
  const { params, banners } = createParams({
    socket: {
      send(message) {
        sent.push(message);
      },
      close() {},
    },
  });
  const actions = createAppActions(params);

  assert.equal(actions.requestWhois(network.id, 'MissD', 'buffer-query'), true);

  assert.deepEqual(sent, [
    {
      type: 'raw.send',
      networkId: network.id,
      raw: 'WHOIS MissD',
      sourceBufferId: 'buffer-query',
    },
  ]);
  assert.deepEqual(banners, []);
});
