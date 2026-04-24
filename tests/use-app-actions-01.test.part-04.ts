import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  BufferState,
  ChannelState,
  NetworkProfile,
} from '../shared/protocol.js';
import { initialState } from '../web/src/app-state.js';
import type { Action,State } from '../web/src/app-types.js';
import type { AppSessionSnapshot } from '../web/src/app-session.js';
import type { SocketHandle } from '../web/src/client.js';
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

const createParams = (options: {
  draft?: string;
  state?: State;
  socket?: SocketHandle | null;
} = {}) => {
  const actions: Action[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const composerEntries: string[] = [];
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
      setDraft: () => {},
      recordComposerEntry: (value: string) => {
        composerEntries.push(value);
      },
      updateBanner: (kind: 'notice' | 'error', message: string) => {
        banners.push({ kind, message });
      },
    },
  };
};

test('updateBufferSelfNickAliases applies repair mutations and shows the repair notice', async () => {
  const { params, actions: dispatched, banners } = createParams();
  const fetchCalls: Array<{ url: string; method: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: String(init?.body ?? ''),
    });
    if (String(input) === '/api/buffers/query-1/self-nick-aliases') {
      return Response.json({
        ok: true,
        repairedCount: 1,
        messages: [
          {
            type: 'buffer.upsert',
            buffer: {
              id: 'query-1',
              networkId: network.id,
              kind: 'query',
              target: 'MissD',
              unread: 0,
              selfNickAliases: ['sofiaIsBack'],
            },
          },
          {
            type: 'message.upsert',
            message: {
              id: 'message-1',
              networkId: network.id,
              target: 'MissD',
              nick: 'sofiaIsBack',
              speakerRole: 'self',
              speakerNick: 'sofiaIsBack',
              attributionSource: 'query-alias',
              attributionConfidence: 'high',
              body: 'old imported self line',
              kind: 'line',
              self: true,
              ts: 1,
            },
          },
        ],
      });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  try {
    const actions = createAppActions(params);
    const updated = await actions.updateBufferSelfNickAliases('query-1', { selfNickAliases: ['sofiaIsBack'] });

    assert.equal(updated, true);
    assert.deepEqual(fetchCalls, [{
      url: '/api/buffers/query-1/self-nick-aliases',
      method: 'PUT',
      body: JSON.stringify({ selfNickAliases: ['sofiaIsBack'] }),
    }]);
    assert.deepEqual(dispatched, [
      {
        type: 'upsert-buffer',
        buffer: {
          id: 'query-1',
          networkId: network.id,
          kind: 'query',
          target: 'MissD',
          unread: 0,
          selfNickAliases: ['sofiaIsBack'],
        },
      },
      {
        type: 'upsert-message',
        message: {
          id: 'message-1',
          networkId: network.id,
          target: 'MissD',
          nick: 'sofiaIsBack',
          speakerRole: 'self',
          speakerNick: 'sofiaIsBack',
          attributionSource: 'query-alias',
          attributionConfidence: 'high',
          body: 'old imported self line',
          kind: 'line',
          self: true,
          ts: 1,
        },
      },
    ]);
    assert.deepEqual(banners, [{
      kind: 'notice',
      message: 'Updated self aliases and repaired 1 message.',
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

