import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredNetworkProfile } from '../shared/network-model.js';
import type { ServerMessage } from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import {
  createAssistantStore,
  createConversationStore,
  makeBuffer,
  makeThread,
  networkStore,
} from './helpers/assistant-service-test-stores.js';

const rootNetwork: StoredNetworkProfile = {
  id: 'network-root-1',
  templateId: null,
  managerHidden: false,
  name: 'Cuff-Link',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'sofia',
  altNicks: ['sofia_'],
  username: 'sofia',
  realName: 'Sofia',
  hasPassword: false,
  authMethod: 'none',
  authTarget: 'NickServ',
  authAccount: '',
  favorite: false,
  autoJoin: ['#lesDomme'],
  personaNote: '44 yo Spanish woman',
};

const instanceNetwork: StoredNetworkProfile = {
  ...rootNetwork,
  id: 'network-instance-1',
  templateId: rootNetwork.id,
  managerHidden: true,
};

const buildAskThread = (id: string) => makeThread({
  id,
  bufferId: null,
  networkId: null,
  target: null,
  scope: 'free',
  title: 'Chat',
  task: 'ask',
  turnStatus: null,
});

const buildNetworks = () => ({
  ...networkStore,
  get: (networkId: string) => {
    if (networkId === rootNetwork.id) {
      return rootNetwork;
    }
    if (networkId === instanceNetwork.id) {
      return instanceNetwork;
    }
    return null;
  },
});

const buildMutationHandler = (
  updateCalls: Array<{ networkId: string; note: string }>,
  includeInstance = false,
) => (mutation: { kind: string; networkId: string; note: string }) => {
  if (mutation.kind !== 'persona.note.save') {
    return null;
  }
  updateCalls.push({ networkId: mutation.networkId, note: mutation.note });
  const updatedRoot = { ...rootNetwork, personaNote: mutation.note };
  const messages: ServerMessage[] = [{ type: 'network.upsert', network: updatedRoot }];
  if (includeInstance) {
    messages.push({ type: 'network.upsert', network: { ...instanceNetwork, personaNote: mutation.note } });
  }
  return { messages };
};

const completeHiddenTurn = async (
  service: AssistantService,
  executionThreadId: string,
  remoteTurnId: string,
  agentText: string,
) => {
  const privateService = service as unknown as {
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleTurnCompleted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: Array<{ type: 'agentMessage'; id: string; text: string; phase: null }> } }) => Promise<void>;
  };
  privateService.handleTurnStarted({
    threadId: executionThreadId,
    turn: { id: remoteTurnId, status: 'inProgress', error: null, items: [] },
  });
  await privateService.handleTurnCompleted({
    threadId: executionThreadId,
    turn: {
      id: remoteTurnId,
      status: 'completed',
      error: null,
      items: [{
        type: 'agentMessage',
        id: `${remoteTurnId}:assistant`,
        text: agentText,
        phase: null,
      }],
    },
  });
};

test('assistant service keeps explicit /persona commands on the local deterministic path', async () => {
  const assistantStore = createAssistantStore([buildAskThread('thread-slash')]);
  const activeBuffer = makeBuffer({
    id: 'buffer-slash',
    networkId: instanceNetwork.id,
    kind: 'query',
    target: 'mariebella',
  });
  const appServerCalls: Array<{ method: string; params: unknown }> = [];
  const updateCalls: Array<{ networkId: string; note: string }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore([], activeBuffer),
    networks: buildNetworks(),
    publish: () => {},
    applyAssistantMutation: buildMutationHandler(updateCalls, true),
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      appServerCalls.push({ method, params });
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const result = await service.startTurn({
    threadId: 'thread-slash',
    prompt: '/persona append Married and living in Germany',
    activeBufferId: activeBuffer.id,
  });

  assert.deepEqual(appServerCalls, []);
  assert.deepEqual(updateCalls, [{
    networkId: rootNetwork.id,
    note: '44 yo Spanish woman\nMarried and living in Germany',
  }]);
  assert.deepEqual(result.messages.map((message) => message.type), [
    'network.upsert',
    'network.upsert',
    'assistant.turn.completed',
    'assistant.snapshot',
  ]);
});

test('assistant service resolves natural-language persona updates through the hidden action phase', async () => {
  const assistantStore = createAssistantStore([buildAskThread('thread-natural-update')]);
  const activeBuffer = makeBuffer({
    id: 'buffer-natural-update',
    networkId: instanceNetwork.id,
    kind: 'query',
    target: 'mariebella',
  });
  const updateCalls: Array<{ networkId: string; note: string }> = [];
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore([], activeBuffer),
    networks: buildNetworks(),
    publish: (message) => {
      published.push(message);
    },
    applyAssistantMutation: buildMutationHandler(updateCalls),
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-natural-update' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const result = await service.startTurn({
    threadId: 'thread-natural-update',
    prompt: 'Update my persona: I have a Domme called MissD',
    activeBufferId: activeBuffer.id,
  });

  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.turn.started']);
  const resolverParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
    outputSchema: { required: string[] };
  };
  assert.match(resolverParams.input[0]?.text ?? '', /Task: Decide whether the latest user request should be handled as an assistant-managed saved-state action\./);
  assert.deepEqual(resolverParams.outputSchema.required, ['kind']);

  await completeHiddenTurn(
    service,
    'execution-natural-update',
    'turn-resolve-natural-update',
    JSON.stringify({ kind: 'persona.append', note: 'I have a Domme called MissD' }),
  );

  assert.deepEqual(updateCalls, [{
    networkId: rootNetwork.id,
    note: '44 yo Spanish woman\nI have a Domme called MissD',
  }]);
  assert.equal(published.length, 1);
  const completionMessages = published[0];
  assert.ok(Array.isArray(completionMessages));
  assert.deepEqual(completionMessages.map((message) => message.type), [
    'network.upsert',
    'assistant.turn.completed',
    'assistant.snapshot',
  ]);
  const completed = completionMessages[1];
  assert.equal(completed?.type, 'assistant.turn.completed');
  assert.match(
    completed?.type === 'assistant.turn.completed' && completed.turn.items[1]?.type === 'agentMessage'
      ? completed.turn.items[1].text
      : '',
    /Added that to your persona note for Cuff-Link\./,
  );
});

test('assistant service uses hidden resolution to clarify ambiguous persona mutations', async () => {
  const assistantStore = createAssistantStore([buildAskThread('thread-clarify')]);
  const activeBuffer = makeBuffer({
    id: 'buffer-clarify',
    networkId: instanceNetwork.id,
    kind: 'query',
    target: 'mariebella',
  });
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore([], activeBuffer),
    networks: buildNetworks(),
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-clarify' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const result = await service.startTurn({
    threadId: 'thread-clarify',
    prompt: 'I wanted you to update the persona with that info too',
    activeBufferId: activeBuffer.id,
  });

  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.turn.started']);
  await completeHiddenTurn(
    service,
    'execution-clarify',
    'turn-resolve-clarify',
    JSON.stringify({ kind: 'clarify', message: 'Tell me exactly what to change.' }),
  );

  assert.equal(published.length, 1);
  const completionMessages = published[0];
  assert.ok(Array.isArray(completionMessages));
  assert.deepEqual(completionMessages.map((message) => message.type), [
    'assistant.turn.completed',
    'assistant.snapshot',
  ]);
  const completed = completionMessages[0];
  assert.equal(completed?.type, 'assistant.turn.completed');
  assert.match(
    completed?.type === 'assistant.turn.completed' && completed.turn.items[1]?.type === 'agentMessage'
      ? completed.turn.items[1].text
      : '',
    /Tell me exactly what to change\./,
  );
});

test('assistant service can fall through from hidden action resolution back into the normal ask path', async () => {
  const assistantStore = createAssistantStore([buildAskThread('thread-none')]);
  const activeBuffer = makeBuffer({
    id: 'buffer-none',
    networkId: instanceNetwork.id,
    kind: 'query',
    target: 'mariebella',
  });
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore([], activeBuffer),
    networks: buildNetworks(),
    publish: (message) => {
      published.push(message);
    },
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-none' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-none',
    prompt: 'Can I update the persona notes through the assistant chat?',
    activeBufferId: activeBuffer.id,
  });

  await completeHiddenTurn(
    service,
    'execution-none',
    'turn-resolve-none',
    JSON.stringify({ kind: 'none' }),
  );

  assert.equal(calls.filter((call) => call.method === 'turn/start').length, 2);
  const askParams = calls.filter((call) => call.method === 'turn/start')[1]?.params as {
    input: Array<{ type: string; text: string }>;
    outputSchema?: unknown;
  };
  assert.match(askParams.input[0]?.text ?? '', /Conversation mode: assistant chat with optional transcript lookup/);
  assert.equal(askParams.outputSchema, undefined);
});

test('assistant service rewrites the saved persona note after resolving a rewrite action', async () => {
  const assistantStore = createAssistantStore([buildAskThread('thread-rewrite')]);
  const activeBuffer = makeBuffer({
    id: 'buffer-rewrite',
    networkId: instanceNetwork.id,
    kind: 'query',
    target: 'mariebella',
  });
  const updateCalls: Array<{ networkId: string; note: string }> = [];
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore([], activeBuffer),
    networks: buildNetworks(),
    publish: (message) => {
      published.push(message);
    },
    applyAssistantMutation: buildMutationHandler(updateCalls),
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-rewrite' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const result = await service.startTurn({
    threadId: 'thread-rewrite',
    prompt: 'Rewrite the whole persona in a way that is more readable, while not losing details',
    activeBufferId: activeBuffer.id,
  });

  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.turn.started']);
  await completeHiddenTurn(
    service,
    'execution-rewrite',
    'turn-resolve-rewrite',
    JSON.stringify({ kind: 'persona.rewrite', instruction: 'in a way that is more readable, while not losing details' }),
  );

  const rewriteParams = calls.filter((call) => call.method === 'turn/start')[1]?.params as {
    input: Array<{ type: string; text: string }>;
    outputSchema: { required: string[] };
  };
  assert.match(rewriteParams.input[0]?.text ?? '', /Task: Rewrite the saved persona note for this network\./);
  assert.match(rewriteParams.input[0]?.text ?? '', /Current persona note:\n44 yo Spanish woman/);
  assert.match(rewriteParams.input[0]?.text ?? '', /User request:\nin a way that is more readable, while not losing details/);
  assert.deepEqual(rewriteParams.outputSchema.required, ['note']);

  await completeHiddenTurn(
    service,
    'execution-rewrite',
    'turn-rewrite',
    JSON.stringify({
      note: [
        'I have a Domme called MissD.',
        'I am a 44 yo white female from Spain living in Germany.',
        'I have been married since 2019.',
      ].join('\n'),
    }),
  );

  assert.deepEqual(updateCalls, [{
    networkId: rootNetwork.id,
    note: [
      'I have a Domme called MissD.',
      'I am a 44 yo white female from Spain living in Germany.',
      'I have been married since 2019.',
    ].join('\n'),
  }]);
  assert.equal(published.length, 1);
  const completionMessages = published[0];
  assert.ok(Array.isArray(completionMessages));
  assert.deepEqual(completionMessages.map((message) => message.type), [
    'network.upsert',
    'assistant.turn.completed',
    'assistant.snapshot',
  ]);
  const completed = completionMessages[1];
  assert.equal(completed?.type, 'assistant.turn.completed');
  assert.match(
    completed?.type === 'assistant.turn.completed' && completed.turn.items[1]?.type === 'agentMessage'
      ? completed.turn.items[1].text
      : '',
    /Updated your persona note for Cuff-Link\./,
  );
  assert.match(
    completed?.type === 'assistant.turn.completed' && completed.turn.items[1]?.type === 'agentMessage'
      ? completed.turn.items[1].text
      : '',
    /I have a Domme called MissD\./,
  );
});

test('assistant service provides recent thread context to the hidden resolver for follow-up persona edits', async () => {
  const assistantStore = createAssistantStore([buildAskThread('thread-followup')]);
  assistantStore.saveThreadTurns('thread-followup', [{
    id: 'turn-draft',
    status: 'completed',
    error: null,
    items: [
      { type: 'userMessage', id: 'turn-draft:user', text: 'Show me the corrected persona note', attachments: [] },
      {
        type: 'agentMessage',
        id: 'turn-draft:assistant',
        text: [
          'The corrected persona note should be:',
          'I have a Domme called MissD',
          'I have a husband',
        ].join('\n'),
        phase: null,
        artifact: null,
      },
    ],
    activeBuffer: null,
    resolvedSubject: null,
    routing: null,
  }]);
  const activeBuffer = makeBuffer({
    id: 'buffer-followup',
    networkId: instanceNetwork.id,
    kind: 'query',
    target: 'mariebella',
  });
  const updateCalls: Array<{ networkId: string; note: string }> = [];
  const calls: Array<{ method: string; params: unknown }> = [];
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore([], activeBuffer),
    networks: buildNetworks(),
    publish: (message) => {
      published.push(message);
    },
    applyAssistantMutation: buildMutationHandler(updateCalls),
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') {
        return { thread: { id: 'execution-followup' } };
      }
      if (method === 'turn/start') {
        return {};
      }
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({
    threadId: 'thread-followup',
    prompt: 'So, add them now',
    activeBufferId: activeBuffer.id,
  });

  const resolverParams = calls[1]?.params as {
    input: Array<{ type: string; text: string }>;
  };
  assert.match(resolverParams.input[0]?.text ?? '', /Recent assistant thread transcript:/);
  assert.match(resolverParams.input[0]?.text ?? '', /The corrected persona note should be:/);

  await completeHiddenTurn(
    service,
    'execution-followup',
    'turn-resolve-followup',
    JSON.stringify({
      kind: 'persona.set',
      note: [
        'I have a Domme called MissD',
        'I have a husband',
      ].join('\n'),
    }),
  );

  assert.deepEqual(updateCalls, [{
    networkId: rootNetwork.id,
    note: [
      'I have a Domme called MissD',
      'I have a husband',
    ].join('\n'),
  }]);
  assert.equal(published.length, 1);
});

test('assistant service completes incomplete /persona commands locally with a clarification reply', async () => {
  const assistantStore = createAssistantStore([buildAskThread('thread-slash-clarify')]);
  const appServerCalls: Array<string> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore(),
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
  };

  privateService.appServer = {
    call: async (method: string) => {
      appServerCalls.push(method);
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const result = await service.startTurn({
    threadId: 'thread-slash-clarify',
    prompt: '/persona set',
  });

  assert.deepEqual(appServerCalls, []);
  assert.deepEqual(result.messages.map((message) => message.type), [
    'assistant.turn.completed',
    'assistant.snapshot',
  ]);
});
