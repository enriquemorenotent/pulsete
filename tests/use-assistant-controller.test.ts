import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  AssistantThread,
  AssistantThreadSummary,
  BufferState,
  NetworkProfile,
} from '../shared/protocol.js';
import { initialState } from '../web/src/app-state.js';
import { getAskThreadForBuffer, getAskThreads } from '../web/src/assistant-thread-selection.js';
import {
  isAssistantBusy,
  isAssistantThreadLoading,
  shouldAutoLoadAssistantThread,
  useAssistantController,
} from '../web/src/useAssistantController.js';
import type { AssistantActionSet } from '../web/src/useAppActions.js';
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

const mariebellaBuffer: BufferState = {
  id: 'buffer-mariebella',
  networkId: network.id,
  kind: 'query',
  target: 'mariebella',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const aiBuffer: BufferState = {
  id: 'buffer-ai',
  networkId: network.id,
  kind: 'query',
  target: 'AI',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const makeAskSummary = (overrides: Partial<AssistantThreadSummary>): AssistantThreadSummary => ({
  id: overrides.id ?? 'thread-1',
  bufferId: overrides.bufferId ?? mariebellaBuffer.id,
  networkId: overrides.networkId ?? network.id,
  target: overrides.target ?? mariebellaBuffer.target,
  scope: overrides.scope ?? 'buffer',
  title: overrides.title ?? `Ask · ${overrides.target ?? mariebellaBuffer.target}`,
  task: 'ask',
  model: 'gpt-5.4',
  turnStatus: overrides.turnStatus ?? null,
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
});

const makeAskThread = (summary: AssistantThreadSummary): AssistantThread => ({
  ...summary,
  turns: [],
});

const createWorkspace = (
  selectedBuffer: BufferState | null,
): WorkspaceView => ({
  mode: selectedBuffer?.kind === 'query' ? 'query-connected' : 'channel-connected',
  selection: selectedBuffer ? { kind: 'buffer', bufferId: selectedBuffer.id } : null,
  connectionInstances: [network],
  selectedNetwork: network,
  selectedRuntime: { phase: 'connected', serverName: 'irc.example.test', nick: 'tester' },
  selectedBuffer,
  selectedChannel: null,
  selectedPendingChannel: null,
  headerTitle: selectedBuffer?.target ?? 'server',
  headerSubtitle: '',
  composerMode: 'normal',
  composerPlaceholder: selectedBuffer ? `Message ${selectedBuffer.target}` : 'Message',
  emptyBody: '',
  showNicklist: false,
});

const createActionSet = (
  overrides: Partial<AssistantActionSet> = {},
): AssistantActionSet => ({
  cancelAssistantLogin: async () => {},
  clearAssistantThreads: async () => true,
  createAssistantThread: async () => null,
  interruptAssistantThread: async () => true,
  interruptAssistantTurn: async () => true,
  loadAssistantThread: async () => null,
  logoutAssistant: async () => {},
  openMentionedChannel: () => {},
  setAssistantActiveThread: async () => null,
  startAssistantChatgptLogin: async () => null,
  startAssistantTurn: async () => true,
  updateAssistantDefaultModel: async () => null,
  useAssistantDraft: () => {},
  ...overrides,
}) as AssistantActionSet;

const renderController = (params: {
  actions?: AssistantActionSet;
  assistant?: Partial<typeof initialState.domain.assistant>;
  assistantThreads?: Record<string, AssistantThread>;
  assistantUi?: Partial<typeof initialState.transient.assistant>;
  workspace?: WorkspaceView;
}) => {
  let controller: ReturnType<typeof useAssistantController> | null = null;
  const actions = params.actions ?? createActionSet();
  const assistant = {
    ...initialState.domain.assistant,
    serviceStatus: 'ready' as const,
    ...params.assistant,
  };
  const assistantThreads = params.assistantThreads ?? {};
  const assistantUi = {
    ...initialState.transient.assistant,
    ...params.assistantUi,
  };
  const workspace = params.workspace ?? createWorkspace(mariebellaBuffer);

  const Harness = () => {
    controller = useAssistantController({
      actions,
      assistant,
      assistantThreads,
      assistantUi,
      workspace,
    });
    return null;
  };

  renderToStaticMarkup(createElement(Harness));
  assert.ok(controller);
  return controller as ReturnType<typeof useAssistantController>;
};

test('assistant loading stays false when no thread is selected', () => {
  assert.equal(isAssistantThreadLoading(null, null), false);
  assert.equal(isAssistantThreadLoading(null, 'thread-1'), false);
});

test('assistant thread filtering keeps all ask threads sorted newest-first', () => {
  const threads = [
    makeAskSummary({ id: 'thread-buffer', updatedAt: 2 }),
    makeAskSummary({
      id: 'thread-free',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
      updatedAt: 3,
    }),
  ];

  assert.deepEqual(
    getAskThreads(threads).map((thread) => thread.id),
    ['thread-free', 'thread-buffer'],
  );
});

test('assistant picks the newest buffer-scoped ask thread for the selected PM', () => {
  const threads = [
    makeAskSummary({ id: 'thread-mariebella-old', updatedAt: 1 }),
    makeAskSummary({ id: 'thread-mariebella-new', updatedAt: 5 }),
    makeAskSummary({ id: 'thread-ai', bufferId: aiBuffer.id, target: aiBuffer.target, updatedAt: 9 }),
    makeAskSummary({
      id: 'thread-free',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
      updatedAt: 10,
    }),
  ];

  assert.equal(
    getAskThreadForBuffer(threads, mariebellaBuffer.id)?.id,
    'thread-mariebella-new',
  );
  assert.equal(getAskThreadForBuffer(threads, aiBuffer.id)?.id, 'thread-ai');
  assert.equal(getAskThreadForBuffer(threads, null), null);
});

test('assistant loading is true only for the selected thread', () => {
  assert.equal(isAssistantThreadLoading('thread-1', null), false);
  assert.equal(isAssistantThreadLoading('thread-1', 'thread-2'), false);
  assert.equal(isAssistantThreadLoading('thread-1', 'thread-1'), true);
});

test('assistant thread auto-load runs only before the first failed attempt for a thread', () => {
  assert.equal(shouldAutoLoadAssistantThread('thread-1', null, null, null), true);
  assert.equal(shouldAutoLoadAssistantThread('thread-1', null, 'thread-1', null), false);
});

test('assistant thread auto-load stays disabled while loading or after the thread is already loaded', () => {
  assert.equal(
    shouldAutoLoadAssistantThread('thread-1', 'thread-1', null, null),
    false,
  );
  assert.equal(
    shouldAutoLoadAssistantThread('thread-1', null, null, {
      ...makeAskThread(makeAskSummary({ id: 'thread-1' })),
    }),
    false,
  );
});

test('assistant stays busy while the loaded thread summary is still in progress', () => {
  assert.equal(
    isAssistantBusy(
      makeAskSummary({ id: 'thread-1', turnStatus: 'inProgress' }),
      makeAskThread(makeAskSummary({ id: 'thread-1', turnStatus: 'inProgress' })),
    ),
    true,
  );
});

test('assistant controller ignores global ask-thread selection and binds to the current PM', () => {
  const mariebellaThread = makeAskThread(makeAskSummary({
    id: 'thread-mariebella',
    bufferId: mariebellaBuffer.id,
    target: mariebellaBuffer.target,
    updatedAt: 2,
  }));
  const freeThread = makeAskThread(makeAskSummary({
    id: 'thread-free',
    bufferId: null,
    networkId: null,
    target: null,
    scope: 'free',
    title: 'Chat',
    updatedAt: 20,
  }));

  const controller = renderController({
    assistant: {
      activeThreadId: freeThread.id,
      threads: [freeThread, mariebellaThread],
    },
    assistantThreads: {
      [mariebellaThread.id]: mariebellaThread,
      [freeThread.id]: freeThread,
    },
    assistantUi: {
      selectedThreadId: freeThread.id,
    },
    workspace: createWorkspace(mariebellaBuffer),
  });

  assert.equal(controller.thread?.id, mariebellaThread.id);
  assert.equal(controller.contextKey, mariebellaThread.id);
  assert.equal(controller.activeBufferLabel, mariebellaBuffer.target);
});

test('assistant controller clears the current PM ask threads before starting a new chat', async () => {
  const clearedThreadIds: string[][] = [];
  const createdTasks: string[] = [];
  const controller = renderController({
    actions: createActionSet({
      clearAssistantThreads: async (threadIds) => {
        clearedThreadIds.push([...threadIds]);
        return true;
      },
      createAssistantThread: async (task) => {
        createdTasks.push(task);
        return makeAskSummary({
          id: 'thread-mariebella-fresh',
          bufferId: mariebellaBuffer.id,
          target: mariebellaBuffer.target,
          updatedAt: 10,
        });
      },
    }),
    assistant: {
      threads: [
        makeAskSummary({
          id: 'thread-mariebella-new',
          bufferId: mariebellaBuffer.id,
          target: mariebellaBuffer.target,
          updatedAt: 5,
        }),
        makeAskSummary({
          id: 'thread-mariebella-old',
          bufferId: mariebellaBuffer.id,
          target: mariebellaBuffer.target,
          updatedAt: 3,
        }),
        makeAskSummary({
          id: 'thread-ai',
          bufferId: aiBuffer.id,
          target: aiBuffer.target,
          updatedAt: 8,
        }),
      ],
    },
    assistantThreads: {
      'thread-mariebella-new': makeAskThread(makeAskSummary({
        id: 'thread-mariebella-new',
        bufferId: mariebellaBuffer.id,
        target: mariebellaBuffer.target,
        updatedAt: 5,
      })),
    },
  });

  assert.equal(await controller.onNewChat(), true);
  assert.deepEqual(clearedThreadIds, [['thread-mariebella-new', 'thread-mariebella-old']]);
  assert.deepEqual(createdTasks, ['ask']);
});

test('assistant controller auto-creates a PM-scoped ask thread when the current PM has none', async () => {
  const createdTasks: string[] = [];
  const startedTurns: Array<{
    threadId: string;
    prompt: string;
    activeBufferId: string | null;
  }> = [];

  const controller = renderController({
    actions: createActionSet({
      createAssistantThread: async (task) => {
        createdTasks.push(task);
        return makeAskSummary({
          id: 'thread-mariebella-new',
          bufferId: mariebellaBuffer.id,
          target: mariebellaBuffer.target,
          updatedAt: 11,
        });
      },
      startAssistantTurn: async (threadId, prompt, _attachments, activeBufferId) => {
        startedTurns.push({ threadId, prompt, activeBufferId: activeBufferId ?? null });
        return true;
      },
    }),
    assistant: {
      activeThreadId: 'thread-free',
      threads: [
        makeAskSummary({
          id: 'thread-free',
          bufferId: null,
          networkId: null,
          target: null,
          scope: 'free',
          title: 'Chat',
          updatedAt: 20,
        }),
      ],
    },
  });

  assert.equal(controller.contextKey, mariebellaBuffer.id);
  assert.equal(await controller.onSubmitPrompt('  Hello  ', []), true);
  assert.deepEqual(createdTasks, ['ask']);
  assert.deepEqual(startedTurns, [{
    threadId: 'thread-mariebella-new',
    prompt: 'Hello',
    activeBufferId: mariebellaBuffer.id,
  }]);
});
