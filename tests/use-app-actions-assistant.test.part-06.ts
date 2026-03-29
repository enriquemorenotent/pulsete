import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AssistantThread,
  AssistantThreadSummary,
  AssistantTurnAttachmentInput,
  BufferState,
  ChannelState,
  NetworkProfile,
} from '../shared/protocol.js';
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

const askSummary: AssistantThreadSummary = {
  id: 'thread-1',
  bufferId: null,
  networkId: null,
  target: null,
  scope: 'free',
  title: 'Chat',
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

test('interruptAssistantThread sends the thread-level interrupt request', async () => {
  const state = createState();
  const { params, banners, dispatched } = createParams(state);
  const fetchCalls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
    });
    if (String(input) === '/api/assistant/threads/thread-1/interrupt') {
      return okJson({ ok: true });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  try {
    const actions = createAppActions(params);
    const interrupted = await actions.interruptAssistantThread('thread-1');

    assert.equal(interrupted, true);
    assert.deepEqual(fetchCalls, [{
      url: '/api/assistant/threads/thread-1/interrupt',
      method: 'POST',
    }]);
    assert.deepEqual(dispatched.map((action) => action.type), ['assistant-thread-stop-requested']);
    assert.deepEqual(banners, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
}) as Response;

