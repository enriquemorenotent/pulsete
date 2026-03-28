import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import { buildPreviousLexicalRetrieval, buildLineMessage, missD } from './helpers/assistant-ask-fixtures.js';
import { createConversationStore, createAssistantStore, makeBuffer, makeThread, networkStore } from './helpers/assistant-service-test-stores.js';

test('assistant service reuses prior retrieval evidence for transcript follow-ups and refines it with a new search', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat', turnStatus: null })]);
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    activeBuffer: missD,
    resolvedSubject: missD,
    routing: { retrieval: buildPreviousLexicalRetrieval(['meet']), retrievals: [buildPreviousLexicalRetrieval(['meet'])] },
    items: [
      { type: 'userMessage', id: 'turn-1:user', text: 'When did I meet MissD?', attachments: [] },
      { type: 'agentMessage', id: 'turn-1:assistant', text: 'You met MissD around 01:32.', phase: null, artifact: null },
    ],
  }]);
  const allMessages: ChatMessage[] = [
    buildLineMessage({ id: 'message-1', nick: 'MissD', body: 'Nice to meet you Diana.', self: false, ts: Date.parse('2025-10-31T01:38:00Z') }),
    buildLineMessage({ id: 'message-2', nick: 'sofia', body: 'We talked about fantasy and the first time we met.', self: true, ts: Date.parse('2025-11-01T04:10:00Z') }),
  ];
  const service = new AssistantService({ assistant: assistantStore, conversations: createConversationStore(allMessages, makeBuffer()), networks: networkStore, publish: () => {}, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-4' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: missD.bufferId, prompt: 'We have talked often about fantasy, about the first time that we meet. Could you tell me what it was?' });
  const text = ((calls[1]?.params as { input: Array<{ type: string; text: string }> }).input[0]?.text) ?? '';
  assert.doesNotMatch(text, /Previously retrieved transcript context from earlier turns:/);
  assert.match(text, /Operation: fts_search/);
  assert.match(text, /fantasy/);
  assert.match(text, /first time we met/);
});

test('assistant service treats plain-language follow-up hints as refinement searches', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat', turnStatus: null })]);
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    activeBuffer: missD,
    resolvedSubject: missD,
    routing: { retrieval: buildPreviousLexicalRetrieval(), retrievals: [buildPreviousLexicalRetrieval()] },
    items: [
      { type: 'userMessage', id: 'turn-1:user', text: 'MissD and I talked once of a fantasy when we would meet in real for the first time. Tell me which one it is', attachments: [] },
      { type: 'agentMessage', id: 'turn-1:assistant', text: 'The closest fantasy in the current excerpts is about being on all four.', phase: null, artifact: null },
    ],
  }]);
  const allMessages: ChatMessage[] = [
    buildLineMessage({ id: 'message-1', nick: 'sofia', body: 'We talked about a fantasy of meeting in real.', self: true, ts: Date.parse('2026-02-22T16:02:00Z') }),
    buildLineMessage({ id: 'message-2', nick: 'MissD', body: 'Maybe at the hotel bar before going upstairs.', self: false, ts: Date.parse('2026-02-22T16:03:00Z') }),
  ];
  const service = new AssistantService({ assistant: assistantStore, conversations: createConversationStore(allMessages, makeBuffer()), networks: networkStore, publish: () => {}, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-4b' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: missD.bufferId, prompt: 'It was related to a hotel' });
  const text = ((calls[1]?.params as { input: Array<{ type: string; text: string }> }).input[0]?.text) ?? '';
  assert.match(text, /Previously retrieved transcript context from earlier turns:/);
  assert.match(text, /Search terms: fantasy, meet/);
  assert.match(text, /Operation: fts_search/);
  assert.match(text, /Search terms: fantasy, hotel/);
  assert.match(text, /hotel bar before going upstairs/);
});

test('assistant service resets stale follow-up retrievals for origin questions and loads opening context', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: null, networkId: null, target: null, scope: 'free', title: 'Chat', turnStatus: null })]);
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'completed',
    error: null,
    activeBuffer: missD,
    resolvedSubject: missD,
    routing: { retrieval: buildPreviousLexicalRetrieval(['fantasy', 'hotel']), retrievals: [buildPreviousLexicalRetrieval(['fantasy', 'hotel'])] },
    items: [
      { type: 'userMessage', id: 'turn-1:user', text: 'MissD and I talked once of a fantasy when we would meet in real for the first time. Tell me which one it is', attachments: [] },
      { type: 'agentMessage', id: 'turn-1:assistant', text: 'The closest fantasy in the current excerpts is about being on all four.', phase: null, artifact: null },
    ],
  }]);
  const allMessages: ChatMessage[] = [
    buildLineMessage({ id: 'message-1', nick: 'sofiaIsBack', body: 'Hello, how aer you?', self: true, ts: Date.parse('2025-10-31T01:29:00Z') }),
    buildLineMessage({ id: 'message-2', nick: 'MissD', body: 'im well thanks, how about yu', self: false, ts: Date.parse('2025-10-31T01:30:00Z') }),
    buildLineMessage({ id: 'message-3', nick: 'sofiaIsBack', body: 'Where are you from?', self: true, ts: Date.parse('2025-10-31T01:31:00Z') }),
    buildLineMessage({ id: 'message-4', nick: 'sofiaIsBack', body: 'West coast is USA?', self: true, ts: Date.parse('2025-10-31T01:31:30Z') }),
    buildLineMessage({ id: 'message-5', nick: 'MissD', body: 'yes.. california', self: false, ts: Date.parse('2025-10-31T01:32:00Z') }),
  ];
  const service = new AssistantService({ assistant: assistantStore, conversations: createConversationStore(allMessages, makeBuffer()), networks: networkStore, publish: () => {}, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-4c' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', activeBufferId: missD.bufferId, prompt: 'Where is MissD from?' });
  const text = ((calls[1]?.params as { input: Array<{ type: string; text: string }> }).input[0]?.text) ?? '';
  assert.doesNotMatch(text, /Previously retrieved transcript context from earlier turns:/);
  assert.match(text, /Operation: profile_fact_search\(intent=origin_location, limit=6\)/);
  assert.match(text, /Operation: load_opening_buffer_messages\(limit=40\)/);
  assert.match(text, /Where are you from\?/);
  assert.match(text, /yes\.\. california/);
});
