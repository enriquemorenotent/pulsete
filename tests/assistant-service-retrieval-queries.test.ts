import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import { createConversationStore, createAssistantStore, makeBuffer, makeThread, networkStore } from './helpers/assistant-service-test-stores.js';
import { missD } from './helpers/assistant-ask-fixtures.js';

test('assistant service retrieves matching transcript excerpts only for explicit ask queries', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat', turnStatus: null })]);
  const allMessages: ChatMessage[] = [
    { id: 'message-1', networkId: 'network-1', target: '#general', nick: 'alice', body: 'We should use postgres for analytics storage.', kind: 'line', self: false, ts: Date.parse('2026-01-10T08:00:00Z') },
    ...Array.from({ length: 700 }, (_, index) => ({ id: `noise-${index}`, networkId: 'network-1', target: '#general', nick: 'bot', body: `daily chatter ${index} `.repeat(6).trim(), kind: 'line' as const, self: false, ts: Date.parse('2026-02-01T09:00:00Z') + index * 60_000 })),
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore(allMessages, makeBuffer({ kind: 'channel', target: '#general' })),
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-2' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: 'buffer-1', prompt: 'When did we talk about postgres?' });
  const text = ((calls[1]?.params as { input: Array<{ type: string; text: string }> }).input[0]?.text) ?? '';
  assert.match(text, /Retrieved transcript context:/);
  assert.match(text, /Operation: fts_search/);
  assert.match(text, /Search terms: .*postgres/);
  assert.match(text, /Excerpt:/);
  assert.match(text, /2026-01-10/);
  assert.match(text, /alice: We should use postgres for analytics storage\./);
});

test('assistant service retrieves transcript excerpts for first-turn recollection prompts', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat', turnStatus: null })]);
  const allMessages: ChatMessage[] = [
    { id: 'message-1', networkId: 'network-1', target: 'MissD', nick: 'MissD', body: 'My fantasy is that the first time we meet in person you arrive in a red coat.', kind: 'line', self: false, ts: Date.parse('2025-10-31T01:40:00Z') },
    { id: 'message-2', networkId: 'network-1', target: 'MissD', nick: 'sofia', body: 'I still remember that fantasy.', kind: 'line', self: true, ts: Date.parse('2025-10-31T01:41:00Z') },
  ];
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: createConversationStore(allMessages, makeBuffer()),
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-2b' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: 'buffer-1', prompt: 'MissD and I have talked about a fantasy, the first time that we would meet in person. Can you remind me what it is?' });
  const text = ((calls[1]?.params as { input: Array<{ type: string; text: string }> }).input[0]?.text) ?? '';
  assert.match(text, /Operation: fts_search/);
  assert.match(text, /Search terms: .*fantasy/);
  assert.match(text, /first time we meet in person/);
  assert.match(text, /red coat/);
  assert.match(text, /MissD: My fantasy is that the first time we meet in person you arrive in a red coat\./);
  assert.match(text, /You: I still remember that fantasy\./);
});

test('assistant service resolves yes against the prior ask clarification and loads opening transcript context', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat', turnStatus: null })]);
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    activeBuffer: missD,
    resolvedSubject: null,
    routing: { pendingClarification: { kind: 'confirmSelectedBufferSubject', originalPrompt: 'Tell me about the way we started talking to each other in the beginning' }, retrievals: [] },
    items: [
      { type: 'userMessage', id: 'turn-1:user', text: 'Tell me about the way we started talking to each other in the beginning', attachments: [] },
      { type: 'agentMessage', id: 'turn-1:assistant', text: 'Do you mean your conversation with MissD in the selected buffer?', phase: null, artifact: null },
    ],
  }]);
  const allMessages: ChatMessage[] = [
    { id: 'message-1', networkId: 'network-1', target: 'MissD', nick: 'MissD', body: 'hello there', kind: 'line', self: false, ts: Date.parse('2026-01-10T08:00:00Z') },
    { id: 'message-2', networkId: 'network-1', target: 'MissD', nick: 'sofia', body: 'hi Miss', kind: 'line', self: false, ts: Date.parse('2026-01-10T08:01:00Z') },
  ];
  const service = new AssistantService({ assistant: assistantStore, conversations: createConversationStore(allMessages, makeBuffer()), networks: networkStore, publish: () => {}, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-3' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: missD.bufferId, prompt: 'Yes' });
  const text = ((calls[1]?.params as { input: Array<{ type: string; text: string }> }).input[0]?.text) ?? '';
  assert.match(text, /Operation: load_opening_buffer_messages/);
  assert.match(text, /Messages returned: 2/);
  assert.match(text, /MissD: hello there/);
  assert.match(text, /(?:sofia|You): hi Miss/);
});
