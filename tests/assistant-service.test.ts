import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import test from 'node:test';
import type { StoredNetworkProfile } from '../shared/network-model.js';
import type {
  AssistantSnapshot,
  AssistantPreferences,
  AssistantTurnAttachmentInput,
  AssistantTurn,
  AssistantThreadSummary,
  BufferState,
  ServerMessage,
} from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from '../server/runtime-store-ports.js';
import type { ChatMessage } from '../shared/protocol.js';

const makeThread = (overrides: Partial<AssistantThreadSummary> = {}): AssistantThreadSummary => ({
  id: overrides.id ?? 'thread-1',
  bufferId: overrides.bufferId ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#general',
  title: overrides.title ?? 'Ask · #general',
  task: overrides.task ?? 'ask',
  model: overrides.model ?? 'gpt-5.4',
  turnStatus: overrides.turnStatus ?? null,
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
});

const createAssistantStore = (
  initialThreads: AssistantThreadSummary[]
): RuntimeAssistantStore & {
  threads: Map<string, AssistantThreadSummary>;
  turns: Map<string, AssistantTurn[]>;
} => {
  let preferences: AssistantPreferences = {
    defaultModel: 'gpt-5.4',
    activeThreadId: null,
  };
  const threads = new Map(initialThreads.map((thread) => [thread.id, thread]));
  const turns = new Map<string, AssistantTurn[]>();
  return {
    threads,
    turns,
    listThreads: () => [...threads.values()],
    getThread: (threadId) => threads.get(threadId) ?? null,
    getThreadTurns: (threadId) => turns.get(threadId) ?? [],
    saveThreadTurns: (threadId, nextTurns) => {
      turns.set(threadId, nextTurns);
    },
    upsertThread: (input) => {
      const previous = threads.get(input.id);
      const next = {
        ...previous,
        ...input,
        createdAt: input.createdAt ?? previous?.createdAt ?? Date.now(),
        updatedAt: input.updatedAt ?? previous?.updatedAt ?? Date.now(),
      };
      threads.set(next.id, next);
      return next;
    },
    removeThread: (threadId) => {
      threads.delete(threadId);
      if (preferences.activeThreadId === threadId) {
        preferences = { ...preferences, activeThreadId: null };
      }
    },
    getPreferences: () => preferences,
    savePreferences: (input) => {
      preferences = input;
      return input;
    },
  };
};

const conversationStore: RuntimeConversationStore = {
  listBuffers: () => [],
  listChannels: () => [],
  getBuffer: () => null,
  getBufferByTarget: () => null,
  getServerBuffer: () => null,
  getChannelByName: () => null,
  markBufferRead: () => {},
  removeBuffer: () => null,
  deleteChannelByName: () => {},
  setBufferUnread: () => {},
  updateChannelUsers: () => {},
  updateChannelTopic: () => {},
  listMessages: () => [],
  listAllMessages: () => [],
  deleteMessages: () => [],
  deleteMessagesByIdPrefixes: () => [],
  upsertChannel: () => {
    throw new Error('Not implemented in assistant-service test');
  },
  upsertBuffer: () => {
    throw new Error('Not implemented in assistant-service test');
  },
  upsertQuery: () => {
    throw new Error('Not implemented in assistant-service test');
  },
  appendMessage: () => {
    throw new Error('Not implemented in assistant-service test');
  },
};

const networkStore: RuntimeNetworkStore = {
  list: () => [],
  get: () => null,
  getRuntime: () => null,
  upsert: () => {
    throw new Error('Not implemented in assistant-service test');
  },
  saveWithRelatedInstances: () => {
    throw new Error('Not implemented in assistant-service test');
  },
  deleteWithRelated: () => [],
};

test('assistant service fails in-flight turns when the app-server becomes unavailable', () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: 'inProgress' }),
    makeThread({ id: 'thread-2', target: '#random', title: 'Ask · #random', turnStatus: 'inProgress' }),
  ]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const privateService = service as unknown as {
    auth: AssistantSnapshot['auth'];
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleUnavailable: (error: Error | null) => void;
  };
  privateService.auth = {
    ...service.snapshot().auth,
    pendingLoginId: 'login-1',
    pendingAuthUrl: 'https://auth.example.test',
  };

  privateService.handleTurnStarted({
    threadId: 'thread-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  published.length = 0;

  privateService.handleUnavailable(new Error('codex crashed'));

  assert.equal(assistantStore.threads.get('thread-1')?.turnStatus, 'failed');
  assert.equal(assistantStore.threads.get('thread-2')?.turnStatus, 'failed');
  assert.equal(published.length, 1);
  assert.ok(Array.isArray(published[0]));

  const messages = published[0];
  assert.ok(Array.isArray(messages));
  assert.deepEqual(messages.map((message) => message.type), [
    'assistant.turn.completed',
    'assistant.snapshot',
  ]);

  const completed = messages[0];
  assert.equal(completed?.type, 'assistant.turn.completed');
  assert.equal(completed?.type === 'assistant.turn.completed' && completed.turn.status, 'failed');
  assert.equal(completed?.type === 'assistant.turn.completed' && completed.turn.error, 'codex crashed');

  const snapshot = messages[1];
  assert.equal(snapshot?.type, 'assistant.snapshot');
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.serviceStatus, 'error');
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.auth.pendingLoginId, null);
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.auth.pendingAuthUrl, null);
  assert.equal(
    snapshot?.type === 'assistant.snapshot'
    && snapshot.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-1')?.turnStatus,
    'failed',
  );
  assert.equal(
    snapshot?.type === 'assistant.snapshot'
    && snapshot.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-2')?.turnStatus,
    'failed',
  );
});

test('assistant service creates local threads without an app-server round trip', async () => {
  const assistantStore = createAssistantStore([]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const thread = await service.createThread({ bufferId: null, task: 'ask' });

  assert.equal(calls.length, 0);
  assert.match(thread.id, /^assistant:/);
  assert.equal(service.snapshot().activeThreadId, thread.id);
});

test('assistant service deletes idle threads and clears the active thread reference', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  assistantStore.savePreferences({
    defaultModel: 'gpt-5.4',
    activeThreadId: 'thread-1',
  });
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });

  const result = await service.deleteThread('thread-1');

  assert.equal(assistantStore.getThread('thread-1'), null);
  assert.equal(service.snapshot().activeThreadId, null);
  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.snapshot']);
  assert.equal(published.length, 0);
});

test('assistant service clears a running thread and discards late completion events', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleTurnCompleted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => Promise<void>;
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Hello' });
  privateService.handleTurnStarted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  published.length = 0;

  const result = await service.deleteThread('thread-1');

  assert.equal(assistantStore.getThread('thread-1'), null);
  assert.deepEqual(calls.at(-1), {
    method: 'turn/interrupt',
    params: {
      threadId: 'execution-1',
      turnId: 'turn-1',
    },
  });
  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.snapshot']);
  assert.equal(published.length, 0);

  published.length = 0;
  await privateService.handleTurnCompleted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'interrupted',
      error: null,
      items: [],
    },
  });

  assert.equal(published.length, 0);
});

test('assistant service clears a pending thread and interrupts it once the turn starts', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Hello' });
  published.length = 0;

  const result = await service.deleteThread('thread-1');
  assert.equal(assistantStore.getThread('thread-1'), null);
  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.snapshot']);

  privateService.handleTurnStarted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.map((call) => call.method), [
    'thread/start',
    'turn/start',
    'turn/interrupt',
  ]);
  assert.equal(published.length, 0);
});

test('assistant service rejects starting a new turn while the current one is still running', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: 'inProgress' }),
  ]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  await assert.rejects(
    service.startTurn({ threadId: 'thread-1', prompt: 'Hello again' }),
    /Wait for the current assistant turn to stop before starting another one/,
  );
});

test('assistant service interrupts a running thread without requiring the caller to know the turn id', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Hello' });
  privateService.handleTurnStarted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });

  calls.splice(0);
  await service.interruptThread('thread-1');

  assert.deepEqual(calls, [{
    method: 'turn/interrupt',
    params: {
      threadId: 'execution-1',
      turnId: 'turn-1',
    },
  }]);
});

test('assistant service queues a thread interrupt until the turn id becomes available', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Hello' });
  await service.interruptThread('thread-1');

  privateService.handleTurnStarted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.map((call) => call.method), [
    'thread/start',
    'turn/start',
    'turn/interrupt',
  ]);
  assert.deepEqual(calls[2]?.params, {
    threadId: 'execution-1',
    turnId: 'turn-1',
  });
});

test('assistant service converts ready-event failures into error snapshots', async () => {
  const assistantStore = createAssistantStore([]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: {
      emit: (event: string) => boolean;
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
  };
  privateService.appServer.call = async (method: string) => {
    if (method === 'account/read') {
      throw new Error('account/read failed');
    }
    if (method === 'account/rateLimits/read') {
      return { rateLimits: { limitId: null, primary: null, secondary: null, credits: null, planType: null } };
    }
    if (method === 'model/list') {
      return { data: [] };
    }
    throw new Error(`Unexpected app-server method: ${method}`);
  };

  privateService.appServer.emit('ready');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(published.length, 1);
  const snapshotMessage = published[0];
  assert.ok(snapshotMessage && !Array.isArray(snapshotMessage));
  const assistantSnapshot = snapshotMessage as Extract<ServerMessage, { type: 'assistant.snapshot' }>;
  assert.equal(assistantSnapshot.type, 'assistant.snapshot');
  assert.equal(assistantSnapshot.assistant.serviceStatus, 'error');
  assert.equal(assistantSnapshot.assistant.serviceError, 'account/read failed');
});

test('assistant service rolls back optimistic thread status when turn start fails', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
  };
  const calls: Array<{ method: string; params: unknown }> = [];

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      if (method === 'turn/start') {
        throw new Error('Signed out');
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await assert.rejects(
    service.startTurn({ threadId: 'thread-1', prompt: 'Hello' }),
    /Signed out/,
  );

  assert.equal(assistantStore.threads.get('thread-1')?.turnStatus, null);
  assert.equal(published.length, 2);
  const firstSnapshot = published[0];
  const secondSnapshot = published[1];
  assert.ok(firstSnapshot && !Array.isArray(firstSnapshot));
  assert.ok(secondSnapshot && !Array.isArray(secondSnapshot));
  const firstMessage = firstSnapshot as ServerMessage;
  const secondMessage = secondSnapshot as ServerMessage;
  assert.equal(firstMessage.type, 'assistant.snapshot');
  assert.equal(secondMessage.type, 'assistant.snapshot');
  assert.equal(
    firstMessage.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-1')?.turnStatus,
    'inProgress',
  );
  assert.equal(
    secondMessage.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-1')?.turnStatus,
    null,
  );
  assert.equal(calls[0]?.method, 'thread/start');
  const threadStartParams = calls[0]?.params as {
    model: string;
    modelProvider: string;
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
    personality: string;
    serviceName: string;
    baseInstructions: string;
  };
  assert.equal(threadStartParams.model, 'gpt-5.4');
  assert.equal(threadStartParams.modelProvider, 'openai');
  assert.equal(threadStartParams.cwd, tmpdir());
  assert.equal(threadStartParams.approvalPolicy, 'never');
  assert.equal(threadStartParams.sandbox, 'read-only');
  assert.equal(threadStartParams.personality, 'pragmatic');
  assert.equal(threadStartParams.serviceName, 'pulsete_assistant');
  assert.match(threadStartParams.baseInstructions, /explicit attachments included in the user input/);
  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    threadId: string;
    input: Array<{ type: string; text: string }>;
    cwd: string;
    approvalPolicy: string;
    sandboxPolicy: unknown;
    model: string;
    personality: string;
    outputSchema?: null;
  };
  assert.equal(turnStartParams.threadId, 'execution-1');
  assert.equal(turnStartParams.cwd, tmpdir());
  assert.equal(turnStartParams.approvalPolicy, 'never');
  assert.deepEqual(turnStartParams.sandboxPolicy, {
    type: 'readOnly',
    access: {
      type: 'restricted',
      includePlatformDefaults: false,
      readableRoots: [],
    },
    networkAccess: false,
  });
  assert.equal(turnStartParams.model, 'gpt-5.4');
  assert.equal(turnStartParams.personality, 'pragmatic');
  assert.equal(turnStartParams.outputSchema, undefined);
  assert.equal(turnStartParams.input.length, 1);
  assert.equal(turnStartParams.input[0]?.type, 'text');
  assert.match(turnStartParams.input[0]?.text ?? '', /IRC buffer context:/);
  assert.match(turnStartParams.input[0]?.text ?? '', /User request:[\s\S]*Hello/);
});

test('assistant service packs older matching history into the prompt context', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const allMessages: ChatMessage[] = [
    {
      id: 'message-1',
      networkId: 'network-1',
      target: '#general',
      nick: 'alice',
      body: 'We should use postgres for analytics storage.',
      kind: 'line',
      self: false,
      ts: Date.parse('2026-01-10T08:00:00Z'),
    },
    ...Array.from({ length: 700 }, (_, index) => ({
      id: `noise-${index}`,
      networkId: 'network-1',
      target: '#general',
      nick: 'bot',
      body: `daily chatter ${index} `.repeat(6).trim(),
      kind: 'line' as const,
      self: false,
      ts: Date.parse('2026-02-01T09:00:00Z') + index * 60_000,
    })),
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      listAllMessages: () => allMessages,
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-2' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'When did we talk about postgres?' });

  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  const text = turnStartParams.input[0]?.text ?? '';
  assert.match(text, /Prompt search terms: .*postgres/);
  assert.match(text, /Historical windows:/);
  assert.match(text, /use postgres for analytics storage/);
});

test('assistant service persists attachment metadata locally and excludes prior attachment contents from later turns', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleItemCompleted: (params: {
      threadId: string;
      turnId: string;
      item: { type: 'agentMessage'; id: string; text: string; phase: null };
    }) => void;
    handleTurnCompleted: (params: {
      threadId: string;
      turn: { id: string; status: string; error: unknown; items: [] };
    }) => Promise<void>;
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: `execution-${calls.filter((call) => call.method === 'thread/start').length}` } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };
  const attachments: AssistantTurnAttachmentInput[] = [
    {
      id: 'attachment-1',
      kind: 'text',
      name: 'notes.md',
      mimeType: 'text/markdown',
      size: 32,
      text: 'Very secret deploy notes',
    },
    {
      id: 'attachment-2',
      kind: 'image',
      name: 'diagram.png',
      mimeType: 'image/png',
      size: 64,
      dataUrl: 'data:image/png;base64,AAA=',
    },
  ];

  await service.startTurn({
    threadId: 'thread-1',
    prompt: 'Please review these attachments.',
    attachments,
  });

  privateService.handleTurnStarted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  privateService.handleItemCompleted({
    threadId: 'execution-1',
    turnId: 'turn-1',
    item: {
      type: 'agentMessage',
      id: 'agent-1',
      text: 'I reviewed them.',
      phase: null,
    },
  });
  await privateService.handleTurnCompleted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'completed',
      error: null,
      items: [],
    },
  });

  const storedThread = await service.readThread('thread-1');
  const storedUserItem = storedThread.turns[0]?.items[0];
  assert.equal(storedUserItem?.type, 'userMessage');
  assert.equal(storedUserItem?.type === 'userMessage' && storedUserItem.text, 'Please review these attachments.');
  assert.deepEqual(
    storedUserItem?.type === 'userMessage' && storedUserItem.attachments,
    [
      {
        id: 'attachment-1',
        kind: 'text',
        name: 'notes.md',
        mimeType: 'text/markdown',
        size: 32,
      },
      {
        id: 'attachment-2',
        kind: 'image',
        name: 'diagram.png',
        mimeType: 'image/png',
        size: 64,
      },
    ],
  );
  assert.equal(JSON.stringify(storedThread.turns).includes('Very secret deploy notes'), false);
  assert.equal(JSON.stringify(storedThread.turns).includes('data:image/png'), false);

  await service.startTurn({
    threadId: 'thread-1',
    prompt: 'What did I attach earlier?',
  });

  const secondTurnStart = calls.filter((call) => call.method === 'turn/start')[1]?.params as {
    input: Array<{ type: string; text?: string; url?: string }>;
  };
  const secondEnvelope = secondTurnStart.input[0]?.text ?? '';
  assert.match(secondEnvelope, /notes\.md/);
  assert.doesNotMatch(secondEnvelope, /Very secret deploy notes/);
  assert.doesNotMatch(secondEnvelope, /data:image\/png/);
  assert.equal(secondTurnStart.input.length, 1);
});

test('assistant service simplifies structured turn errors from the app-server', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: 'buffer-1',
      networkId: 'network-1',
      target: 'RichJake',
      title: 'Ask · RichJake',
      turnStatus: null,
    }),
  ]);
  const buffer: BufferState = {
    id: 'buffer-1',
    networkId: 'network-1',
    kind: 'query',
    target: 'RichJake',
    unread: 0,
  };
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      getBuffer: (bufferId) => bufferId === buffer.id ? buffer : null,
      upsertQuery: () => buffer,
      appendMessage: (input) => input,
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleTurnCompleted: (params: {
      threadId: string;
      turn: {
        id: string;
        status: string;
        error: unknown;
        items: [];
      };
    }) => Promise<void>;
  };
  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') {
        return { thread: { id: 'execution-import-error' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    prompt: 'What went wrong?',
    attachments: [{
      id: 'attachment-1',
      kind: 'text',
      name: 'richjake.log',
      mimeType: 'text/plain',
      size: 20,
      text: '<RichJake> hi',
    }],
  });

  privateService.handleTurnStarted({
    threadId: 'execution-import-error',
    turn: {
      id: 'turn-import-error',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  await privateService.handleTurnCompleted({
    threadId: 'execution-import-error',
    turn: {
      id: 'turn-import-error',
      status: 'failed',
      error: {
        message: JSON.stringify({
          error: {
            type: 'invalid_request_error',
            message: "Unsupported value: 'xhigh' is not supported with the active model.",
            param: 'reasoning.effort',
          },
          status: 400,
        }),
      },
      items: [],
    },
  });

  const storedThread = await service.readThread('thread-1');
  const failedTurn = storedThread.turns[0];
  assert.equal(failedTurn?.status, 'failed');
  assert.equal(
    failedTurn?.error,
    "Unsupported value: 'xhigh' is not supported with the active model.",
  );
});

test('assistant service ignores stale login completions from superseded auth flows', async () => {
  const assistantStore = createAssistantStore([]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const privateService = service as unknown as {
    auth: AssistantSnapshot['auth'];
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleLoginCompleted: (params: { loginId?: string; success: boolean; error?: string | null }) => Promise<void>;
  };
  privateService.auth = {
    ...service.snapshot().auth,
    pendingLoginId: 'login-2',
    pendingAuthUrl: 'https://auth-2.example.test',
  };
  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'account/read') {
        return { requiresOpenaiAuth: true, account: null };
      }
      if (method === 'account/rateLimits/read') {
        throw new Error('No rate limits');
      }
      if (method === 'model/list') {
        return { data: [] };
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await privateService.handleLoginCompleted({ loginId: 'login-1', success: true });

  assert.equal(service.snapshot().auth.pendingLoginId, 'login-2');
  assert.equal(service.snapshot().auth.pendingAuthUrl, 'https://auth-2.example.test');
  assert.equal(published.length, 1);
  const message = published[0];
  assert.ok(message && !Array.isArray(message));
  const snapshotMessage = message as Extract<ServerMessage, { type: 'assistant.snapshot' }>;
  assert.equal(snapshotMessage.type, 'assistant.snapshot');
  assert.equal(snapshotMessage.assistant.auth.pendingLoginId, 'login-2');
  assert.equal(snapshotMessage.assistant.auth.pendingAuthUrl, 'https://auth-2.example.test');
});
