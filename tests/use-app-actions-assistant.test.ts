import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantThread, AssistantThreadSummary, BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import { initialState } from '../web/src/app-state.js';
import type { Action, State } from '../web/src/app-types.js';
import type { AppSessionSnapshot } from '../web/src/app-session.js';
import { buildConversationModel } from '../web/src/conversation-model.js';
import { createAppActions } from '../web/src/useAppActions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
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
};

const selectedChannel: ChannelState = {
  id: selectedBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: '',
  users: [],
};

const askSummary: AssistantThreadSummary = {
  id: 'thread-1',
  bufferId: selectedBuffer.id,
  networkId: network.id,
  target: selectedBuffer.target,
  title: 'Ask · #general',
  task: 'ask',
  model: 'gpt-5.4',
  turnStatus: null,
  createdAt: 1,
  updatedAt: 2,
};

const askThread: AssistantThread = {
  ...askSummary,
  turns: [],
};

const workspace: WorkspaceView = {
  mode: 'channel-connected',
  selection: { kind: 'buffer', bufferId: selectedBuffer.id },
  connectionInstances: [network],
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

const createState = (overrides: {
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
    networkStates: {
      [network.id]: {
        phase: 'connected',
        serverName: 'irc.example.test',
        nick: 'tester',
      },
    },
    assistant: {
      ...initialState.domain.assistant,
      serviceStatus: 'ready',
    },
    ...overrides.domain,
  },
  transient: {
    ...initialState.transient,
    selection: { kind: 'buffer', bufferId: selectedBuffer.id },
    ...overrides.transient,
  },
});

const createParams = (state: State, workspaceView = workspace) => {
  const dispatched: Action[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const drafts: string[] = [];
  const conversation = buildConversationModel({
    buffers: state.domain.buffers,
    channels: state.domain.channels,
    pendingChannels: state.domain.pendingChannels,
  });

  return {
    dispatched,
    banners,
    drafts,
    params: {
      session: {
        conversation,
        draft: '',
        state,
        workspace: workspaceView,
      } satisfies AppSessionSnapshot,
      dispatch: (action: Action) => {
        dispatched.push(action);
      },
      socketRef: { current: null },
      setDraft: (value: string) => {
        drafts.push(value);
      },
      recordComposerEntry: () => {},
      updateBanner: (kind: 'notice' | 'error', message: string) => {
        banners.push({ kind, message });
      },
    },
  };
};

test('createAssistantThread seeds a local empty thread without an extra fetch', async () => {
  const state = createState();
  const { params, dispatched, banners } = createParams(state);
  const fetchCalls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    fetchCalls.push({ url, method: String(init?.method ?? 'GET') });
    if (url === '/api/assistant/threads') {
      return okJson({ thread: askSummary });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const actions = createAppActions(params);
    const created = await actions.createAssistantThread('ask');

    assert.deepEqual(created, askSummary);
    assert.deepEqual(fetchCalls, [{ url: '/api/assistant/threads', method: 'POST' }]);
    assert.deepEqual(dispatched.map((action) => action.type), [
      'assistant-snapshot',
      'select-assistant-thread',
      'assistant-thread-loaded',
    ]);
    assert.equal(dispatched[0]?.type, 'assistant-snapshot');
    assert.equal(dispatched[0]?.type === 'assistant-snapshot' && dispatched[0].assistant.activeThreadId, askSummary.id);
    assert.equal(dispatched[2]?.type, 'assistant-thread-loaded');
    assert.deepEqual(dispatched[2]?.type === 'assistant-thread-loaded' && dispatched[2].thread, askThread);
    assert.deepEqual(banners, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createAssistantThread blocks draft threads when the current buffer is not sendable', async () => {
  const state = createState();
  const serverWorkspace: WorkspaceView = {
    ...workspace,
    selectedBuffer: { ...selectedBuffer, kind: 'server', target: 'server' },
    selectedChannel: null,
    composerMode: 'commands',
  };
  const { params, banners } = createParams(state, serverWorkspace);
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return okJson({});
  }) as typeof fetch;

  try {
    const actions = createAppActions(params);
    const created = await actions.createAssistantThread('draft');

    assert.equal(created, null);
    assert.equal(fetchCalled, false);
    assert.deepEqual(banners, [
      { kind: 'error', message: 'Select a channel or private message before creating a draft thread' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('startAssistantChatgptLogin opens a placeholder window before the login request resolves', async () => {
  const state = createState();
  const { params, dispatched, banners } = createParams(state);
  let resolveFetch: ((value: Response) => void) | null = null;
  const fetchCalls: string[] = [];
  const openCalls: string[] = [];
  let navigatedTo: string | null = null;
  const popup = {
    closed: false,
    opener: null,
    document: { title: '' },
    location: {
      replace: (url: string) => {
        navigatedTo = url;
      },
    },
    focus: () => {},
    close: () => {},
  };
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.fetch = (((input) => {
    fetchCalls.push(String(input));
    return new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
  }) as typeof fetch);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      open: (url?: string) => {
        openCalls.push(String(url ?? ''));
        return popup;
      },
    },
  });

  try {
    const actions = createAppActions(params);
    const pending = actions.startAssistantChatgptLogin();

    assert.deepEqual(fetchCalls, ['/api/assistant/auth/chatgpt/start']);
    assert.deepEqual(openCalls, ['about:blank']);
    assert.equal(navigatedTo, null);

    if (resolveFetch === null) {
      assert.fail('Expected login fetch to be pending');
    }
    const completeFetch = resolveFetch as (value: Response) => void;
    completeFetch(okJson({ loginId: 'login-1', authUrl: 'https://auth.example.test' }) as Response);
    const started = await pending;

    assert.equal(started, true);
    assert.equal(navigatedTo, 'https://auth.example.test');
    assert.equal(dispatched[0]?.type, 'assistant-snapshot');
    assert.equal(
      dispatched[0]?.type === 'assistant-snapshot' && dispatched[0].assistant.auth.pendingAuthUrl,
      'https://auth.example.test',
    );
    assert.deepEqual(banners, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  }
});

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;
