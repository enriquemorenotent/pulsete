import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import test from 'node:test';
import type {
  AssistantSnapshot,
  AssistantPreferences,
  AssistantThreadSummary,
  ServerMessage,
} from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from '../server/runtime-store-ports.js';

const preferences: AssistantPreferences = {
  defaultModel: 'gpt-5.4',
  activeThreadId: null,
};

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
): RuntimeAssistantStore & { threads: Map<string, AssistantThreadSummary> } => {
  const threads = new Map(initialThreads.map((thread) => [thread.id, thread]));
  return {
    threads,
    listThreads: () => [...threads.values()],
    getThread: (threadId) => threads.get(threadId) ?? null,
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
    },
    getPreferences: () => preferences,
    savePreferences: (input) => input,
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

test('assistant service starts threads with a locked-down codex config', async () => {
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
      if (method === 'thread/start') {
        return { thread: { id: 'thread-1' } };
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.createThread({ bufferId: null, task: 'ask' });

  assert.equal(calls.length, 1);
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
  assert.equal(threadStartParams.sandbox, 'readOnly');
  assert.equal(threadStartParams.personality, 'pragmatic');
  assert.equal(threadStartParams.serviceName, 'pulsete_assistant');
  assert.match(threadStartParams.baseInstructions, /Only use the IRC context included in the user input/);
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
      if (method === 'thread/resume') {
        return {};
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
  assert.deepEqual(calls[0], {
    method: 'thread/resume',
    params: {
      threadId: 'thread-1',
      model: 'gpt-5.4',
      cwd: tmpdir(),
      approvalPolicy: 'never',
      sandbox: 'readOnly',
      personality: 'pragmatic',
    },
  });
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
  assert.equal(turnStartParams.threadId, 'thread-1');
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
  assert.match(turnStartParams.input[0]?.text ?? '', /Recent IRC transcript:/);
  assert.match(turnStartParams.input[0]?.text ?? '', /User request:[\s\S]*Hello/);
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
