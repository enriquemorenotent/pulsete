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
  personaNote: '',
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
  bufferId: selectedBuffer.id,
  networkId: network.id,
  target: selectedBuffer.target,
  scope: 'buffer',
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

type AssistantTurnRequestBody = {
  activeBufferId: string | null;
  clientTurnId: string;
  prompt: string;
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

test('startAssistantTurn renders an optimistic user turn before the request resolves', async () => {
  const state = createState();
  const { params, banners, dispatched } = createParams(state);
  const fetchCalls: Array<{ url: string; method: string; body: string }> = [];
  let resolveFetch: ((value: Response) => void) | null = null;
  const attachments: AssistantTurnAttachmentInput[] = [
    {
      id: 'attachment-1',
      kind: 'text',
      name: 'notes.md',
      mimeType: 'text/markdown',
      size: 24,
      text: 'Deploy notes',
    },
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input, init) => {
    fetchCalls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      body: String(init?.body ?? ''),
    });
    if (String(input) === '/api/assistant/threads/thread-1/turns') {
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }) as typeof fetch;

  try {
    const actions = createAppActions(params);
    const started = await actions.startAssistantTurn('thread-1', 'Can you summarize this?', attachments, selectedBuffer.id);
    const optimisticTurn = dispatched[0];

    assert.equal(started, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, '/api/assistant/threads/thread-1/turns');
    assert.equal(fetchCalls[0]?.method, 'POST');
    assert.equal(optimisticTurn?.type, 'assistant-turn-started');
    assert.equal(
      optimisticTurn?.type === 'assistant-turn-started' && optimisticTurn.turn.items[0]?.type === 'userMessage'
        ? optimisticTurn.turn.items[0].text
        : null,
      'Can you summarize this?',
    );
    const requestBody = JSON.parse(fetchCalls[0]!.body) as {
      activeBufferId: string | null;
      clientTurnId: string;
      prompt: string;
      attachments: AssistantTurnAttachmentInput[];
    };
    assert.equal(requestBody.activeBufferId, selectedBuffer.id);
    assert.equal(requestBody.prompt, 'Can you summarize this?');
    assert.deepEqual(requestBody.attachments, attachments);
    assert.equal(
      optimisticTurn?.type === 'assistant-turn-started' ? optimisticTurn.turn.id : null,
      requestBody.clientTurnId,
    );
    assert.match(requestBody.clientTurnId, /^assistant-turn:/);
    assert.deepEqual(banners, []);

    assert.equal(optimisticTurn?.type, 'assistant-turn-started');
    if (resolveFetch === null) {
      assert.fail('Expected assistant turn request to remain pending');
    }
    const completeFetch = resolveFetch as (value: Response) => void;
    completeFetch(okJson({
      ok: true,
      messages: [{
        type: 'assistant.turn.started',
        threadId: 'thread-1',
        turn: optimisticTurn?.turn,
      }],
    }) as Response);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(dispatched.map((action) => action.type), [
      'assistant-turn-started',
      'assistant-turn-started',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('startAssistantTurn applies persona-note mutation messages returned by assistant chat', async () => {
  const state = createState({
    domain: {
      assistant: {
        ...initialState.domain.assistant,
        serviceStatus: 'ready',
        activeThreadId: askSummary.id,
        threads: [askSummary],
      },
      assistantThreads: {
        [askThread.id]: askThread,
      },
    },
  });
  const { params, banners, dispatched } = createParams(state);
  let requestBody: AssistantTurnRequestBody | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input, init) => {
    if (String(input) !== '/api/assistant/threads/thread-1/turns') {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }
    requestBody = JSON.parse(String(init?.body ?? '{}')) as AssistantTurnRequestBody;
    return Promise.resolve(okJson({
      ok: true,
      messages: [
        {
          type: 'network.upsert',
          network: {
            ...network,
            personaNote: 'Confident and playful',
          },
        },
        {
          type: 'assistant.turn.completed',
          threadId: 'thread-1',
          turn: {
            id: requestBody.clientTurnId,
            status: 'completed',
            error: null,
            items: [
              {
                type: 'userMessage',
                id: `${requestBody.clientTurnId}:user`,
                text: requestBody.prompt,
                attachments: [],
              },
              {
                type: 'agentMessage',
                id: `${requestBody.clientTurnId}:assistant`,
                text: 'Updated your persona note for TestNet.\n\nCurrent note:\nConfident and playful',
                phase: null,
                artifact: null,
              },
            ],
            activeBuffer: {
              bufferId: selectedBuffer.id,
              networkId: selectedBuffer.networkId,
              target: selectedBuffer.target,
              title: selectedBuffer.target,
            },
            resolvedSubject: null,
            routing: null,
          },
        },
        {
          type: 'assistant.snapshot',
          assistant: {
            ...state.domain.assistant,
            activeThreadId: askSummary.id,
            threads: [{ ...askSummary, turnStatus: 'completed', updatedAt: 3 }],
          },
        },
      ],
    }) as Response);
  }) as typeof fetch;

  try {
    const actions = createAppActions(params);
    const started = await actions.startAssistantTurn(
      'thread-1',
      'Set my persona note to: Confident and playful',
      [],
      selectedBuffer.id,
    );
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(started, true);
    assert.ok(requestBody);
    const resolvedRequestBody = requestBody as AssistantTurnRequestBody;
    assert.equal(resolvedRequestBody.activeBufferId, selectedBuffer.id);
    assert.deepEqual(dispatched.map((action) => action.type), [
      'assistant-turn-started',
      'upsert-network',
      'assistant-turn-completed',
      'assistant-snapshot',
    ]);
    const upsert = dispatched[1];
    assert.equal(upsert?.type, 'upsert-network');
    assert.equal(upsert?.type === 'upsert-network' && upsert.network.personaNote, 'Confident and playful');
    const completed = dispatched[2];
    assert.equal(completed?.type, 'assistant-turn-completed');
    assert.equal(completed?.type === 'assistant-turn-completed' && completed.turn.id, resolvedRequestBody.clientTurnId);
    assert.match(
      completed?.type === 'assistant-turn-completed' && completed.turn.items[1]?.type === 'agentMessage'
        ? completed.turn.items[1].text
        : '',
      /Updated your persona note for TestNet\./,
    );
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
