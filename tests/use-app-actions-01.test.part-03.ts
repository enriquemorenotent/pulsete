import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  BufferState,
  BufferHistoryImportSummary,
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

test('importBufferHistory applies server mutations and shows the import summary notice', async () => {
  const { params, actions: dispatched, banners } = createParams();
  const fetchCalls: Array<{ url: string; method: string; body: string }> = [];
  const summary: BufferHistoryImportSummary = {
    format: 'hexchat',
    importedCount: 2,
    duplicateCount: 1,
    skippedCount: 3,
  };
  const files = [{
    name: 'pm.log',
    mimeType: 'text/plain',
    size: 128,
    text: 'Mär 11 02:57:36 <sofia>\tHere I am',
  }];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: String(init?.body ?? ''),
    });
    if (String(input) === '/api/buffers/buffer-1/history/import') {
      return Response.json({
        ok: true,
        summary,
        messages: [
          {
            type: 'message.append',
            message: {
              id: 'message-2',
              networkId: network.id,
              target: '#general',
              nick: 'tester',
              body: 'hello again',
              kind: 'line',
              self: true,
              ts: 2,
            },
          },
        ],
      });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  try {
    const actions = createAppActions(params);
    const imported = await actions.importBufferHistory(selectedBuffer.id, { files, selfNicks: [] });

    assert.equal(imported, true);
    assert.deepEqual(fetchCalls, [{
      url: '/api/buffers/buffer-1/history/import',
      method: 'POST',
      body: JSON.stringify({ files, selfNicks: [] }),
    }]);
    assert.deepEqual(dispatched, [{
      type: 'append-message',
      message: {
        id: 'message-2',
        networkId: network.id,
        target: '#general',
        nick: 'tester',
        body: 'hello again',
        kind: 'line',
        self: true,
        ts: 2,
      },
    }]);
    assert.deepEqual(banners, [{
      kind: 'notice',
      message: 'Imported 2 messages from hexchat logs (1 existing line skipped, 3 non-matching lines skipped).',
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
