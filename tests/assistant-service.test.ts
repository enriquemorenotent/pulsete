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
  scope: overrides.scope ?? 'buffer',
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

const parseSearchQueryTerms = (query: string) =>
  [...query.matchAll(/"([^"]+)"\*?|"([^"]+)"|([a-z0-9#@._-]+)\*?/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? '')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== 'and' && value !== 'or');

const scoreMessageForTerms = (message: ChatMessage, terms: string[]) => {
  const haystack = [message.nick ?? '', message.body, String(message.ts)].join(' ').toLowerCase();
  return terms.reduce((total, term) => total + (haystack.includes(term) ? Math.max(3, term.length) : 0), 0);
};

const createConversationStore = (
  allMessages: ChatMessage[] = [],
  activeBuffer: BufferState | null = null,
): RuntimeConversationStore => ({
  listBuffers: () => activeBuffer ? [activeBuffer] : [],
  listChannels: () => [],
  getBuffer: (bufferId) => activeBuffer && activeBuffer.id === bufferId ? activeBuffer : null,
  getBufferByTarget: () => activeBuffer,
  getServerBuffer: () => null,
  getChannelByName: () => null,
  markBufferRead: () => {},
  removeBuffer: () => null,
  deleteChannelByName: () => {},
  setBufferUnread: () => {},
  updateChannelUsers: () => {},
  updateChannelTopic: () => {},
  listMessages: (_networkId, _target, limit = 200) => allMessages.slice(-limit),
  listMessagePage: (_networkId, _target, limit) => ({ messages: allMessages.slice(-limit), hasMore: allMessages.length > limit }),
  listAllMessages: () => allMessages,
  listOpeningMessages: (_networkId, _target, limit) => allMessages.slice(0, limit),
  listRecentMessagesForBuffer: (_networkId, _target, limit) => allMessages.slice(-limit),
  getMessageWindow: (messageId, before, after) => {
    const index = allMessages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      return [];
    }
    return allMessages.slice(Math.max(0, index - before), Math.min(allMessages.length, index + after + 1));
  },
  searchMessages: (_networkId, _target, query, limit) => {
    const terms = parseSearchQueryTerms(query);
    return allMessages
      .map((message) => ({
        message,
        score: scoreMessageForTerms(message, terms),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.message.ts - right.message.ts)
      .slice(0, limit);
  },
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
});

const conversationStore = createConversationStore();

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

test('assistant service persists in-progress turns so thread reloads keep the pending prompt', async () => {
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
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
  };
  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    clientTurnId: 'assistant-turn:client-1',
    prompt: 'Summarize what happened earlier.',
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

  const storedThread = await service.readThread('thread-1');
  const pendingTurn = storedThread.turns[0];
  const pendingMessage = pendingTurn?.items[0];

  assert.equal(storedThread.turnStatus, 'inProgress');
  assert.equal(pendingTurn?.id, 'assistant-turn:client-1');
  assert.equal(pendingTurn?.status, 'inProgress');
  assert.equal(pendingMessage?.type, 'userMessage');
  assert.equal(pendingMessage?.type === 'userMessage' && pendingMessage.text, 'Summarize what happened earlier.');
});

test('assistant service normalizes streaming ask replies for reloaded threads', async () => {
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
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleItemStarted: (params: {
      threadId: string;
      turnId: string;
      item: { type: 'agentMessage'; id: string; text: string; phase: null };
    }) => void;
    handleItemDelta: (params: { threadId: string; turnId: string; itemId: string; delta: string }) => void;
  };
  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Tell me the current status.' });
  privateService.handleTurnStarted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  privateService.handleItemStarted({
    threadId: 'execution-1',
    turnId: 'turn-1',
    item: {
      type: 'agentMessage',
      id: 'agent-1',
      text: '',
      phase: null,
    },
  });
  privateService.handleItemDelta({
    threadId: 'execution-1',
    turnId: 'turn-1',
    itemId: 'agent-1',
    delta: 'Answer:The strongest hotel mention is on 2026-03-23.It looks direct.',
  });

  const storedThread = await service.readThread('thread-1');
  const agentMessage = storedThread.turns[0]?.items.find((item) => item.type === 'agentMessage');

  assert.equal(agentMessage?.type, 'agentMessage');
  assert.equal(
    agentMessage?.type === 'agentMessage' && agentMessage.text,
    'Answer:\nThe strongest hotel mention is on 2026-03-23. It looks direct.',
  );
});

test('assistant service normalizes completed ask replies for readability', async () => {
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
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleItemStarted: (params: {
      threadId: string;
      turnId: string;
      item: { type: 'agentMessage'; id: string; text: string; phase: null };
    }) => void;
    handleItemCompleted: (params: {
      threadId: string;
      turnId: string;
      item: { type: 'agentMessage'; id: string; text: string; phase: null };
    }) => void;
  };
  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Tell me what happened.' });
  privateService.handleTurnStarted({
    threadId: 'execution-1',
    turn: {
      id: 'turn-1',
      status: 'inProgress',
      error: null,
      items: [],
    },
  });
  privateService.handleItemStarted({
    threadId: 'execution-1',
    turnId: 'turn-1',
    item: {
      type: 'agentMessage',
      id: 'agent-1',
      text: '',
      phase: null,
    },
  });
  privateService.handleItemCompleted({
    threadId: 'execution-1',
    turnId: 'turn-1',
    item: {
      type: 'agentMessage',
      id: 'agent-1',
      text: 'Provided.The strongest match is “hotel fantasy.”That part matters.',
      phase: null,
    },
  });

  const storedThread = await service.readThread('thread-1');
  const agentMessage = storedThread.turns[0]?.items.find((item) => item.type === 'agentMessage');

  assert.equal(agentMessage?.type, 'agentMessage');
  assert.equal(
    agentMessage?.type === 'agentMessage' && agentMessage.text,
    'Provided. The strongest match is “hotel fantasy.” That part matters.',
  );
});

test('assistant service normalizes persisted local ask replies when reading a thread', async () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: 'completed' }),
  ]);
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    items: [{
      type: 'agentMessage',
      id: 'agent-1',
      text: 'Answer:The clearest match is from March 23, 2026.Evidence:- 2026-03-23 06:11 — you: "our bed, only for us 2"Limits:- partial evidence only.',
      phase: null,
      artifact: null,
    }],
  }]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  const thread = await service.readThread('thread-1');
  const item = thread.turns[0]?.items[0];

  assert.equal(item?.type, 'agentMessage');
  assert.equal(
    item?.type === 'agentMessage' && item.text,
    'Answer:\nThe clearest match is from March 23, 2026.\n\nEvidence:\n- 2026-03-23 06:11 — you: "our bed, only for us 2"\n\nLimits:\n- partial evidence only.',
  );
  const persistedItem = assistantStore.getThreadTurns('thread-1')?.[0]?.items[0];
  assert.equal(
    persistedItem?.type === 'agentMessage' && persistedItem.text,
    'Answer:\nThe clearest match is from March 23, 2026.\n\nEvidence:\n- 2026-03-23 06:11 — you: "our bed, only for us 2"\n\nLimits:\n- partial evidence only.',
  );
});

test('assistant service fails stale persisted in-progress turns during startup reconciliation', () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: 'inProgress' }),
  ]);
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'inProgress',
    error: null,
    items: [{
      type: 'userMessage',
      id: 'turn-1:user',
      text: 'Do you remember this?',
      attachments: [],
    }],
  }]);

  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  const storedThread = assistantStore.getThread('thread-1');
  const storedTurn = assistantStore.getThreadTurns('thread-1')?.[0];

  assert.equal(service.snapshot().threads.find((thread) => thread.id === 'thread-1')?.turnStatus, 'failed');
  assert.equal(storedThread?.turnStatus, 'failed');
  assert.equal(storedTurn?.status, 'failed');
  assert.equal(storedTurn?.error, 'Assistant service restarted before this turn finished');
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

test('assistant service creates free chat threads without buffer bindings', async () => {
  const assistantStore = createAssistantStore([]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      getBuffer: () => ({
        id: 'buffer-1',
        networkId: 'network-1',
        kind: 'query',
        target: 'MissD',
        unread: 0,
      }),
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  const thread = await service.createThread({ bufferId: 'buffer-1', scope: 'free', task: 'ask' });

  assert.equal(thread.scope, 'free');
  assert.equal(thread.bufferId, null);
  assert.equal(thread.networkId, null);
  assert.equal(thread.target, null);
  assert.equal(thread.title, 'Chat');
});

test('assistant service defaults ask threads to the unified free-chat surface', async () => {
  const assistantStore = createAssistantStore([]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      getBuffer: () => ({
        id: 'buffer-1',
        networkId: 'network-1',
        kind: 'query',
        target: 'MissD',
        unread: 0,
      }),
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  const thread = await service.createThread({ bufferId: 'buffer-1', task: 'ask' });

  assert.equal(thread.scope, 'free');
  assert.equal(thread.bufferId, null);
  assert.equal(thread.networkId, null);
  assert.equal(thread.target, null);
  assert.equal(thread.title, 'Chat');
});

test('assistant service keeps chatty ask turns on the minimal-context path', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
    }),
  ]);
  let historyReads = 0;
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      getBuffer: (bufferId) => bufferId === 'buffer-1'
        ? {
            id: 'buffer-1',
            networkId: 'network-1',
            kind: 'query',
            target: 'MissD',
            unread: 0,
          }
        : null,
      listAllMessages: () => {
        historyReads += 1;
        return [{
          id: 'msg-1',
          networkId: 'network-1',
          target: 'MissD',
          nick: 'MissD',
          body: 'This should never be packaged.',
          kind: 'line',
          self: false,
          ts: Date.now(),
        }];
      },
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
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

  await service.startTurn({ threadId: 'thread-1', activeBufferId: 'buffer-1', prompt: 'hi' });

  const turnStart = calls.find((call) => call.method === 'turn/start')?.params as {
    input: Array<{ type: string; text?: string; url?: string }>;
  };
  const envelope = turnStart.input[0]?.text ?? '';

  assert.equal(historyReads, 0);
  assert.match(envelope, /Conversation mode: assistant chat with optional transcript lookup/);
  assert.match(envelope, /Selected buffer metadata:/);
  assert.match(envelope, /Title: MissD/);
  assert.match(envelope, /Retrieved transcript context:\n\(none loaded for this turn\)/);
  assert.doesNotMatch(envelope, /This should never be packaged/);
  assert.equal(turnStart.input.length, 1);
});

test('assistant service keeps general subject chat on the minimal-context path even when another buffer is selected', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
    }),
  ]);
  let historyReads = 0;
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      listBuffers: () => [
        {
          id: 'buffer-1',
          networkId: 'network-1',
          kind: 'query',
          target: 'MissD',
          unread: 0,
        },
        {
          id: 'buffer-2',
          networkId: 'network-1',
          kind: 'query',
          target: 'MissProxima',
          unread: 0,
        },
      ],
      getBuffer: (bufferId) => (
        bufferId === 'buffer-1'
          ? {
              id: 'buffer-1',
              networkId: 'network-1',
              kind: 'query',
              target: 'MissD',
              unread: 0,
            }
          : bufferId === 'buffer-2'
            ? {
                id: 'buffer-2',
                networkId: 'network-1',
                kind: 'query',
                target: 'MissProxima',
                unread: 0,
              }
            : null
      ),
      listAllMessages: () => {
        historyReads += 1;
        return [{
          id: 'msg-1',
          networkId: 'network-1',
          target: 'MissD',
          nick: 'MissD',
          body: 'This should never be packaged.',
          kind: 'line',
          self: false,
          ts: Date.now(),
        }];
      },
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: {
      call: (method: string, params?: unknown) => Promise<unknown>;
    };
  };
  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-1b' } };
      }
      return {};
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    activeBufferId: 'buffer-2',
    prompt: 'What do you think about MissD?',
  });

  const turnStart = calls.find((call) => call.method === 'turn/start')?.params as {
    input: Array<{ type: string; text?: string; url?: string }>;
  };
  const envelope = turnStart.input[0]?.text ?? '';

  assert.equal(historyReads, 0);
  assert.match(envelope, /Selected buffer metadata:/);
  assert.match(envelope, /Title: MissProxima/);
  assert.match(envelope, /Resolved assistant subject:/);
  assert.match(envelope, /Title: MissD/);
  assert.match(envelope, /Retrieved transcript context:\n\(none loaded for this turn\)/);
  assert.doesNotMatch(envelope, /This should never be packaged/);
  assert.equal(turnStart.input.length, 1);
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
    makeThread({ id: 'thread-1', turnStatus: null }),
  ]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  assistantStore.upsertThread({
    ...assistantStore.getThread('thread-1')!,
    turnStatus: 'inProgress',
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

test('assistant service returns queued turn messages immediately and marks the turn failed if launch fails', async () => {
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

  const result = await service.startTurn({
    threadId: 'thread-1',
    clientTurnId: 'assistant-turn:client-hello',
    prompt: 'Hello',
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.turn.started']);
  const queuedTurn = result.messages[0];
  assert.equal(queuedTurn?.type, 'assistant.turn.started');
  assert.equal(queuedTurn?.type === 'assistant.turn.started' && queuedTurn.turn.id, 'assistant-turn:client-hello');
  assert.equal(queuedTurn?.type === 'assistant.turn.started' && queuedTurn.turn.items[0]?.type, 'userMessage');
  assert.equal(
    queuedTurn?.type === 'assistant.turn.started'
    && queuedTurn.turn.items[0]?.type === 'userMessage'
    && queuedTurn.turn.items[0].text,
    'Hello',
  );

  assert.equal(assistantStore.threads.get('thread-1')?.turnStatus, 'failed');
  assert.equal(published.length, 1);
  const completionMessages = published[0];
  assert.ok(Array.isArray(completionMessages));
  assert.deepEqual(completionMessages.map((message) => message.type), [
    'assistant.turn.completed',
    'assistant.snapshot',
  ]);
  const completedTurn = completionMessages[0];
  const completedSnapshot = completionMessages[1];
  assert.equal(completedTurn?.type, 'assistant.turn.completed');
  assert.equal(completedTurn?.type === 'assistant.turn.completed' && completedTurn.turn.status, 'failed');
  assert.equal(completedTurn?.type === 'assistant.turn.completed' && completedTurn.turn.error, 'Signed out');
  assert.equal(completedSnapshot?.type, 'assistant.snapshot');
  assert.equal(
    completedSnapshot?.type === 'assistant.snapshot'
    && completedSnapshot.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-1')?.turnStatus,
    'failed',
  );
  const storedTurn = assistantStore.getThreadTurns('thread-1')?.[0];
  assert.equal(storedTurn?.status, 'failed');
  assert.equal(storedTurn?.error, 'Signed out');
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
  assert.match(threadStartParams.baseInstructions, /Only use IRC transcript excerpts when they are explicitly included/);
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
  assert.match(turnStartParams.input[0]?.text ?? '', /Selected buffer metadata:\n\(none\)/);
  assert.match(turnStartParams.input[0]?.text ?? '', /Retrieved transcript context:\n\(none loaded for this turn\)/);
  assert.match(turnStartParams.input[0]?.text ?? '', /User request:[\s\S]*Hello/);
  assert.doesNotMatch(turnStartParams.input[0]?.text ?? '', /User: Hello/);
});

test('assistant service retrieves matching transcript excerpts only for explicit ask queries', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
      turnStatus: null,
    }),
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
    conversations: createConversationStore(allMessages, {
      id: 'buffer-1',
      networkId: 'network-1',
      kind: 'channel',
      target: '#general',
      unread: 0,
    }),
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

  await service.startTurn({
    threadId: 'thread-1',
    activeBufferId: 'buffer-1',
    prompt: 'When did we talk about postgres?',
  });

  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  const text = turnStartParams.input[0]?.text ?? '';
  assert.match(text, /Retrieved transcript context:/);
  assert.match(text, /Operation: fts_search/);
  assert.match(text, /Search terms: .*postgres/);
  assert.match(text, /Top matching messages:/);
  assert.match(text, /use postgres for analytics storage/);
});

test('assistant service retrieves transcript excerpts for first-turn recollection prompts', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
      turnStatus: null,
    }),
  ]);
  const allMessages: ChatMessage[] = [
    {
      id: 'message-1',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'MissD',
      body: 'My fantasy is that the first time we meet in person you arrive in a red coat.',
      kind: 'line',
      self: false,
      ts: Date.parse('2025-10-31T01:40:00Z'),
    },
    {
      id: 'message-2',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'sofia',
      body: 'I still remember that fantasy.',
      kind: 'line',
      self: true,
      ts: Date.parse('2025-10-31T01:41:00Z'),
    },
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore(allMessages, {
      id: 'buffer-1',
      networkId: 'network-1',
      kind: 'query',
      target: 'MissD',
      unread: 0,
    }),
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
        return { thread: { id: 'execution-2b' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    activeBufferId: 'buffer-1',
    prompt: 'MissD and I have talked about a fantasy, the first time that we would meet in person. Can you remind me what it is?',
  });

  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  const text = turnStartParams.input[0]?.text ?? '';
  assert.match(text, /Operation: fts_search/);
  assert.match(text, /Search terms: .*fantasy/);
  assert.match(text, /first time we meet in person/);
  assert.match(text, /red coat/);
  assert.match(text, /you \(sofia\): I still remember that fantasy\./);
});

test('assistant service resolves yes against the prior ask clarification and loads opening transcript context', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
      turnStatus: null,
    }),
  ]);
  const selectedBuffer = {
    bufferId: 'buffer-1',
    networkId: 'network-1',
    target: 'MissD',
    title: 'MissD',
  };
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    activeBuffer: selectedBuffer,
    resolvedSubject: null,
    routing: {
      pendingClarification: {
        kind: 'confirmSelectedBufferSubject',
        originalPrompt: 'Tell me about the way we started talking to each other in the beginning',
      },
      retrievals: [],
    },
    items: [
      {
        type: 'userMessage',
        id: 'turn-1:user',
        text: 'Tell me about the way we started talking to each other in the beginning',
        attachments: [],
      },
      {
        type: 'agentMessage',
        id: 'turn-1:assistant',
        text: 'Do you mean your conversation with MissD in the selected buffer?',
        phase: null,
        artifact: null,
      },
    ],
  }]);
  const allMessages: ChatMessage[] = [
    {
      id: 'message-1',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'MissD',
      body: 'hello there',
      kind: 'line',
      self: false,
      ts: Date.parse('2026-01-10T08:00:00Z'),
    },
    {
      id: 'message-2',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'sofia',
      body: 'hi Miss',
      kind: 'line',
      self: false,
      ts: Date.parse('2026-01-10T08:01:00Z'),
    },
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...createConversationStore(allMessages, {
        id: 'buffer-1',
        networkId: 'network-1',
        kind: 'query',
        target: 'MissD',
        unread: 0,
      }),
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
        return { thread: { id: 'execution-3' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    activeBufferId: selectedBuffer.bufferId,
    prompt: 'Yes',
  });

  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  const text = turnStartParams.input[0]?.text ?? '';
  assert.match(text, /Operation: load_opening_buffer_messages/);
  assert.match(text, /Messages returned: 2/);
  assert.match(text, /hello there/);
  assert.match(text, /hi Miss/);
});

test('assistant service reuses prior retrieval evidence for transcript follow-ups and refines it with a new search', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
      turnStatus: null,
    }),
  ]);
  const selectedBuffer = {
    bufferId: 'buffer-1',
    networkId: 'network-1',
    target: 'MissD',
    title: 'MissD',
  };
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    activeBuffer: selectedBuffer,
    resolvedSubject: selectedBuffer,
    routing: {
      retrieval: {
        subject: selectedBuffer,
        request: {
          operation: 'search_buffer',
          limit: 5,
          searchTerms: ['meet'],
        },
        stage: 'legacy_search',
        query: 'meet',
        confidence: 0.5,
        scoreSummary: 'hits=1',
        context: [
          'Retrieved transcript context for MissD:',
          'Operation: search_buffer(limit=5)',
          'Search terms: meet',
          'Matching hits: 1',
        ].join('\n'),
        matchCount: 1,
        matchedMessageIds: ['message-1'],
        windowMessageIds: [['message-1']],
        evidenceMessageIds: ['message-1'],
      },
      retrievals: [{
        subject: selectedBuffer,
        request: {
          operation: 'search_buffer',
          limit: 5,
          searchTerms: ['meet'],
        },
        stage: 'legacy_search',
        query: 'meet',
        confidence: 0.5,
        scoreSummary: 'hits=1',
        context: [
          'Retrieved transcript context for MissD:',
          'Operation: search_buffer(limit=5)',
          'Search terms: meet',
          'Matching hits: 1',
        ].join('\n'),
        matchCount: 1,
        matchedMessageIds: ['message-1'],
        windowMessageIds: [['message-1']],
        evidenceMessageIds: ['message-1'],
      }],
    },
    items: [
      {
        type: 'userMessage',
        id: 'turn-1:user',
        text: 'When did I meet MissD?',
        attachments: [],
      },
      {
        type: 'agentMessage',
        id: 'turn-1:assistant',
        text: 'You met MissD around 01:32.',
        phase: null,
        artifact: null,
      },
    ],
  }]);
  const allMessages: ChatMessage[] = [
    {
      id: 'message-1',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'MissD',
      body: 'Nice to meet you Diana.',
      kind: 'line',
      self: false,
      ts: Date.parse('2025-10-31T01:38:00Z'),
    },
    {
      id: 'message-2',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'sofia',
      body: 'We talked about fantasy and the first time we met.',
      kind: 'line',
      self: true,
      ts: Date.parse('2025-11-01T04:10:00Z'),
    },
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...createConversationStore(allMessages, {
        id: 'buffer-1',
        networkId: 'network-1',
        kind: 'query',
        target: 'MissD',
        unread: 0,
      }),
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
        return { thread: { id: 'execution-4' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    activeBufferId: selectedBuffer.bufferId,
    prompt: 'We have talked often about fantasy, about the first time that we meet. Could you tell me what it was?',
  });

  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  const text = turnStartParams.input[0]?.text ?? '';
  assert.match(text, /Previously retrieved transcript context from earlier turns:/);
  assert.match(text, /Search terms: meet/);
  assert.match(text, /Operation: search_buffer/);
  assert.match(text, /fantasy/);
  assert.match(text, /first time we met/);
});

test('assistant service treats plain-language follow-up hints as refinement searches', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      bufferId: null,
      networkId: null,
      target: null,
      scope: 'free',
      title: 'Chat',
      turnStatus: null,
    }),
  ]);
  const selectedBuffer = {
    bufferId: 'buffer-1',
    networkId: 'network-1',
    target: 'MissD',
    title: 'MissD',
  };
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    activeBuffer: selectedBuffer,
    resolvedSubject: selectedBuffer,
    routing: {
      retrieval: {
        subject: selectedBuffer,
        request: {
          operation: 'search_buffer',
          limit: 5,
          searchTerms: ['fantasy', 'meet'],
        },
        stage: 'legacy_search',
        query: 'fantasy, meet',
        confidence: 0.5,
        scoreSummary: 'hits=1',
        context: [
          'Retrieved transcript context for MissD:',
          'Operation: search_buffer(limit=5)',
          'Search terms: fantasy, meet',
          'Matching hits: 1',
        ].join('\n'),
        matchCount: 1,
        matchedMessageIds: ['message-1'],
        windowMessageIds: [['message-1']],
        evidenceMessageIds: ['message-1'],
      },
      retrievals: [{
        subject: selectedBuffer,
        request: {
          operation: 'search_buffer',
          limit: 5,
          searchTerms: ['fantasy', 'meet'],
        },
        stage: 'legacy_search',
        query: 'fantasy, meet',
        confidence: 0.5,
        scoreSummary: 'hits=1',
        context: [
          'Retrieved transcript context for MissD:',
          'Operation: search_buffer(limit=5)',
          'Search terms: fantasy, meet',
          'Matching hits: 1',
        ].join('\n'),
        matchCount: 1,
        matchedMessageIds: ['message-1'],
        windowMessageIds: [['message-1']],
        evidenceMessageIds: ['message-1'],
      }],
    },
    items: [
      {
        type: 'userMessage',
        id: 'turn-1:user',
        text: 'MissD and I talked once of a fantasy when we would meet in real for the first time. Tell me which one it is',
        attachments: [],
      },
      {
        type: 'agentMessage',
        id: 'turn-1:assistant',
        text: 'The closest fantasy in the current excerpts is about being on all four.',
        phase: null,
        artifact: null,
      },
    ],
  }]);
  const allMessages: ChatMessage[] = [
    {
      id: 'message-1',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'sofia',
      body: 'We talked about a fantasy of meeting in real.',
      kind: 'line',
      self: true,
      ts: Date.parse('2026-02-22T16:02:00Z'),
    },
    {
      id: 'message-2',
      networkId: 'network-1',
      target: 'MissD',
      nick: 'MissD',
      body: 'Maybe at the hotel bar before going upstairs.',
      kind: 'line',
      self: false,
      ts: Date.parse('2026-02-22T16:03:00Z'),
    },
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...createConversationStore(allMessages, {
        id: 'buffer-1',
        networkId: 'network-1',
        kind: 'query',
        target: 'MissD',
        unread: 0,
      }),
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
        return { thread: { id: 'execution-4b' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    activeBufferId: selectedBuffer.bufferId,
    prompt: 'It was related to a hotel',
  });

  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  const text = turnStartParams.input[0]?.text ?? '';
  assert.match(text, /Previously retrieved transcript context from earlier turns:/);
  assert.match(text, /Search terms: fantasy, meet/);
  assert.match(text, /Operation: fts_search/);
  assert.match(text, /Search terms: fantasy, hotel/);
  assert.match(text, /hotel bar before going upstairs/);
});

test('assistant service keeps eager history packaging for summarize tasks', async () => {
  const assistantStore = createAssistantStore([
    makeThread({
      id: 'thread-1',
      task: 'summarize',
      title: 'Summary · alice',
      turnStatus: null,
    }),
  ]);
  const allMessages: ChatMessage[] = [
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `opening-${index}`,
      networkId: 'network-1',
      target: 'alice',
      nick: index % 2 === 0 ? 'alice' : 'me',
      body: `opening ${index}`,
      kind: 'line' as const,
      self: index % 2 === 1,
      ts: Date.parse('2026-01-01T09:00:00Z') + index * 60_000,
    })),
    ...Array.from({ length: 900 }, (_, index) => ({
      id: `noise-${index}`,
      networkId: 'network-1',
      target: 'alice',
      nick: 'alice',
      body: `long tail ${index} `.repeat(8).trim(),
      kind: 'line' as const,
      self: false,
      ts: Date.parse('2026-02-01T09:00:00Z') + index * 60_000,
    })),
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...createConversationStore(allMessages),
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
        return { thread: { id: 'execution-3' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-1',
    prompt: 'Summarize the first 20 messages that I had with this person',
  });

  assert.equal(calls[1]?.method, 'turn/start');
  const turnStartParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  const focusInput = turnStartParams.input.find((item) =>
    item.type === 'text' && item.text.includes('Attached text file: history-query-focus.txt')
  );
  assert.ok(focusInput);
  assert.match(focusInput?.text ?? '', /First 20 messages/);
  assert.match(focusInput?.text ?? '', /opening 0/);
  assert.match(focusInput?.text ?? '', /opening 19/);
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
