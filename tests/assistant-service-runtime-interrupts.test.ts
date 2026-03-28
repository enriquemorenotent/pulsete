import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantService } from '../server/assistant-service.js';
import { conversationStore, createAssistantStore, makeThread, networkStore } from './helpers/assistant-service-test-stores.js';
import { flushAssistantEvents } from './helpers/assistant-service-test-runtime.js';

test('assistant service rejects starting a new turn while the current one is still running', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
  assistantStore.upsertThread({ ...assistantStore.getThread('thread-1')!, turnStatus: 'inProgress' });

  await assert.rejects(service.startTurn({ threadId: 'thread-1', prompt: 'Hello again' }), /Wait for the current assistant turn to stop before starting another one/);
});

test('assistant service interrupts a running thread without requiring the caller to know the turn id', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
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
  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  calls.splice(0);
  await service.interruptThread('thread-1');

  assert.deepEqual(calls, [{ method: 'turn/interrupt', params: { threadId: 'execution-1', turnId: 'turn-1' } }]);
});

test('assistant service queues a thread interrupt until the turn id becomes available', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
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
  await service.interruptThread('thread-1');
  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  await flushAssistantEvents();

  assert.deepEqual(calls.map((call) => call.method), ['thread/start', 'turn/start', 'turn/interrupt']);
  assert.deepEqual(calls[2]?.params, { threadId: 'execution-1', turnId: 'turn-1' });
});

test('assistant service keeps chatty ask turns on the minimal-context path', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat' })]);
  let historyReads = 0;
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      getBuffer: (bufferId) => bufferId === 'buffer-1' ? { id: 'buffer-1', networkId: 'network-1', kind: 'query', target: 'MissD', unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null } : null,
      listAllMessages: () => {
        historyReads += 1;
        return [{ id: 'msg-1', networkId: 'network-1', target: 'MissD', nick: 'MissD', body: 'This should never be packaged.', kind: 'line', self: false, ts: Date.now() }];
      },
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-1' } };
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: 'buffer-1', prompt: 'hi' });
  const envelope = ((calls.find((call) => call.method === 'turn/start')?.params as { input: Array<{ type: string; text?: string }> }).input[0]?.text) ?? '';
  assert.equal(historyReads, 0);
  assert.match(envelope, /Conversation mode: assistant chat with optional transcript lookup/);
  assert.match(envelope, /Selected buffer metadata:/);
  assert.match(envelope, /Title: MissD/);
  assert.match(envelope, /Retrieved transcript context:\n\(none loaded for this turn\)/);
  assert.doesNotMatch(envelope, /This should never be packaged/);
});

test('assistant service keeps general subject chat on the minimal-context path even when another buffer is selected', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat' })]);
  let historyReads = 0;
  const calls: Array<{ method: string; params: unknown }> = [];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: {
      ...conversationStore,
      listBuffers: () => [
        { id: 'buffer-1', networkId: 'network-1', kind: 'query', target: 'MissD', unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null },
        { id: 'buffer-2', networkId: 'network-1', kind: 'query', target: 'MissProxima', unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null },
      ],
      getBuffer: (bufferId) => bufferId === 'buffer-1'
        ? { id: 'buffer-1', networkId: 'network-1', kind: 'query', target: 'MissD', unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null }
        : bufferId === 'buffer-2'
          ? { id: 'buffer-2', networkId: 'network-1', kind: 'query', target: 'MissProxima', unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null }
          : null,
      listAllMessages: () => {
        historyReads += 1;
        return [{ id: 'msg-1', networkId: 'network-1', target: 'MissD', nick: 'MissD', body: 'This should never be packaged.', kind: 'line', self: false, ts: Date.now() }];
      },
    },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-1b' } };
      return {};
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: 'buffer-2', prompt: 'What do you think about MissD?' });
  const envelope = ((calls.find((call) => call.method === 'turn/start')?.params as { input: Array<{ type: string; text?: string }> }).input[0]?.text) ?? '';
  assert.equal(historyReads, 0);
  assert.match(envelope, /Selected buffer metadata:/);
  assert.match(envelope, /Title: MissProxima/);
  assert.match(envelope, /Resolved assistant subject:/);
  assert.match(envelope, /Title: MissD/);
  assert.match(envelope, /Retrieved transcript context:\n\(none loaded for this turn\)/);
  assert.doesNotMatch(envelope, /This should never be packaged/);
});
