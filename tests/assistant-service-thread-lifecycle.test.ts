import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerMessage } from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import { conversationStore, createAssistantStore, makeBuffer, makeThread, networkStore } from './helpers/assistant-service-test-stores.js';
import { flushAssistantEvents } from './helpers/assistant-service-test-runtime.js';

test('assistant service creates local threads without an app-server round trip', async () => {
  const assistantStore = createAssistantStore([]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: { ...conversationStore, getBuffer: () => makeBuffer() },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const thread = await service.createThread({ bufferId: 'buffer-1', task: 'ask' });
  assert.equal(calls.length, 0);
  assert.match(thread.id, /^assistant:/);
  assert.equal(thread.scope, 'buffer');
  assert.equal(service.snapshot().activeThreadId, thread.id);
});

test('assistant service creates ask threads bound to the selected buffer', async () => {
  const assistantStore = createAssistantStore([]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: { ...conversationStore, getBuffer: () => makeBuffer() },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  const thread = await service.createThread({ bufferId: 'buffer-1', scope: 'free', task: 'ask' });
  assert.equal(thread.scope, 'buffer');
  assert.equal(thread.bufferId, 'buffer-1');
  assert.equal(thread.networkId, 'network-1');
  assert.equal(thread.target, 'MissD');
  assert.equal(thread.title, 'Ask · MissD');
});

test('assistant service defaults ask threads to the current buffer surface', async () => {
  const assistantStore = createAssistantStore([]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: { ...conversationStore, getBuffer: () => makeBuffer() },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  const thread = await service.createThread({ bufferId: 'buffer-1', task: 'ask' });
  assert.equal(thread.scope, 'buffer');
  assert.equal(thread.bufferId, 'buffer-1');
  assert.equal(thread.networkId, 'network-1');
  assert.equal(thread.target, 'MissD');
  assert.equal(thread.title, 'Ask · MissD');
});

test('assistant service requires a buffer before starting an ask thread', async () => {
  const assistantStore = createAssistantStore([]);
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: conversationStore,
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });

  await assert.rejects(
    () => service.createThread({ bufferId: null, task: 'ask' }),
    /Select a channel or private message before starting an assistant chat/,
  );
});

test('assistant service deletes idle threads and clears the active thread reference', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  assistantStore.savePreferences({ defaultModel: 'gpt-5.4', activeThreadId: 'thread-1' });
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: (message) => { published.push(message); }, autoStart: false });

  const result = await service.deleteThread('thread-1');
  assert.equal(assistantStore.getThread('thread-1'), null);
  assert.equal(service.snapshot().activeThreadId, null);
  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.snapshot']);
  assert.equal(published.length, 0);
});

test('assistant service clears a running thread and discards late completion events', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: (message) => { published.push(message); }, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleTurnCompleted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => Promise<void>;
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-1' } };
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Hello' });
  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  published.length = 0;

  const result = await service.deleteThread('thread-1');
  assert.equal(assistantStore.getThread('thread-1'), null);
  assert.deepEqual(calls.at(-1), { method: 'turn/interrupt', params: { threadId: 'execution-1', turnId: 'turn-1' } });
  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.snapshot']);
  assert.equal(published.length, 0);

  await privateService.handleTurnCompleted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'interrupted', error: null, items: [] } });
  assert.equal(published.length, 0);
});

test('assistant service clears a pending thread and interrupts it once the turn starts', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: (message) => { published.push(message); }, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-1' } };
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Hello' });
  published.length = 0;
  const result = await service.deleteThread('thread-1');
  assert.equal(assistantStore.getThread('thread-1'), null);
  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.snapshot']);

  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  await flushAssistantEvents();

  assert.deepEqual(calls.map((call) => call.method), ['thread/start', 'turn/start', 'turn/interrupt']);
  assert.equal(published.length, 0);
});
