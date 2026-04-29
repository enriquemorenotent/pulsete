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

test('downloadBufferHistory fetches the transcript attachment and triggers a browser download', async () => {
  const { params, banners } = createParams();
  const fetchCalls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
  const clicked: Array<{ download: string; href: string }> = [];
  const appended: unknown[] = [];
  const removed: unknown[] = [];
  const link = {
    download: '',
    href: '',
    style: { display: '' },
    click() {
      clicked.push({ download: this.download, href: this.href });
    },
    remove() {
      removed.push(this);
    },
  };
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ url: String(input), method: String(init?.method ?? 'GET') });
    if (String(input) === '/api/buffers/buffer-1/history/download') {
      return new Response('history body', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="history-testnet-general.txt"',
        },
      });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;
  globalThis.document = {
    createElement(tagName: string) {
      assert.equal(tagName, 'a');
      return link;
    },
    body: {
      append(element: unknown) {
        appended.push(element);
      },
    },
  } as unknown as Document;
  globalThis.URL.createObjectURL = () => 'blob:test-history';
  globalThis.URL.revokeObjectURL = () => {};

  try {
    const actions = createAppActions(params);
    const downloaded = await actions.downloadBufferHistory(selectedBuffer.id);

    assert.equal(downloaded, true);
    assert.deepEqual(fetchCalls, [{ url: '/api/buffers/buffer-1/history/download', method: 'GET' }]);
    assert.deepEqual(appended, [link]);
    assert.deepEqual(clicked, [{ download: 'history-testnet-general.txt', href: 'blob:test-history' }]);
    assert.deepEqual(removed, [link]);
    assert.deepEqual(banners, []);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test('downloadBufferHistory revokes the blob URL when the browser click fails', async () => {
  const { params, banners } = createParams();
  const original = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    createObjectURL: globalThis.URL.createObjectURL,
    revokeObjectURL: globalThis.URL.revokeObjectURL,
  };
  const removed: unknown[] = [];
  const revoked: string[] = [];
  const link = {
    download: '',
    href: '',
    style: { display: '' },
    click() { throw new Error('click failed'); },
    remove() { removed.push(this); },
  };
  globalThis.fetch = (async () =>
    new Response('history body', { status: 200 })) as typeof fetch;
  globalThis.document = {
    createElement(tagName: string) {
      assert.equal(tagName, 'a');
      return link;
    },
    body: { append() {} },
  } as unknown as Document;
  globalThis.URL.createObjectURL = () => 'blob:test-history';
  globalThis.URL.revokeObjectURL = (url) => revoked.push(url);

  try {
    const actions = createAppActions(params);
    const downloaded = await actions.downloadBufferHistory(selectedBuffer.id);

    assert.equal(downloaded, false);
    assert.deepEqual(removed, [link]);
    assert.deepEqual(revoked, ['blob:test-history']);
    assert.deepEqual(banners, [
      { kind: 'error', message: 'click failed' },
    ]);
  } finally {
    globalThis.fetch = original.fetch;
    globalThis.document = original.document;
    globalThis.URL.createObjectURL = original.createObjectURL;
    globalThis.URL.revokeObjectURL = original.revokeObjectURL;
  }
});
