import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantTurnAttachmentInput, ChatMessage } from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import { conversationStore, createConversationStore, createAssistantStore, makeThread, networkStore } from './helpers/assistant-service-test-stores.js';

test('assistant service keeps eager history packaging for summarize tasks', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', task: 'summarize', title: 'Summary · alice', turnStatus: null })]);
  const allMessages: ChatMessage[] = [
    ...Array.from({ length: 30 }, (_, index) => ({ id: `opening-${index}`, networkId: 'network-1', target: 'alice', nick: index % 2 === 0 ? 'alice' : 'me', body: `opening ${index}`, kind: 'line' as const, self: index % 2 === 1, ts: Date.parse('2026-01-01T09:00:00Z') + index * 60_000 })),
    ...Array.from({ length: 900 }, (_, index) => ({ id: `noise-${index}`, networkId: 'network-1', target: 'alice', nick: 'alice', body: `long tail ${index} `.repeat(8).trim(), kind: 'line' as const, self: false, ts: Date.parse('2026-02-01T09:00:00Z') + index * 60_000 })),
  ];
  const service = new AssistantService({ assistant: assistantStore, conversations: createConversationStore(allMessages), networks: networkStore, publish: () => {}, autoStart: false });
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

  await service.startTurn({ threadId: 'thread-1', prompt: 'Summarize the first 20 messages that I had with this person' });
  const turnStartParams = calls[1]?.params as { input: Array<{ type: string; text: string }> };
  const focusInput = turnStartParams.input.find((item) => item.type === 'text' && item.text.includes('Attached text file: history-query-focus.txt'));
  assert.ok(focusInput);
  assert.match(focusInput?.text ?? '', /First 20 messages/);
  assert.match(focusInput?.text ?? '', /opening 0/);
  assert.match(focusInput?.text ?? '', /opening 19/);
});

test('assistant service persists attachment metadata locally and excludes prior attachment contents from later turns', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleItemCompleted: (params: { threadId: string; turnId: string; item: { type: 'agentMessage'; id: string; text: string; phase: null } }) => void;
    handleTurnCompleted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => Promise<void>;
  };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: `execution-${calls.filter((call) => call.method === 'thread/start').length}` } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const attachments: AssistantTurnAttachmentInput[] = [
    { id: 'attachment-1', kind: 'text', name: 'notes.md', mimeType: 'text/markdown', size: 32, text: 'Very secret deploy notes' },
    { id: 'attachment-2', kind: 'image', name: 'diagram.png', mimeType: 'image/png', size: 64, dataUrl: 'data:image/png;base64,AAA=' },
  ];

  await service.startTurn({ threadId: 'thread-1', prompt: 'Please review these attachments.', attachments });
  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  privateService.handleItemCompleted({ threadId: 'execution-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'agent-1', text: 'I reviewed them.', phase: null } });
  await privateService.handleTurnCompleted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'completed', error: null, items: [] } });

  const storedUserItem = (await service.readThread('thread-1')).turns[0]?.items[0];
  assert.equal(storedUserItem?.type, 'userMessage');
  assert.equal(storedUserItem?.type === 'userMessage' && storedUserItem.text, 'Please review these attachments.');
  assert.deepEqual(storedUserItem?.type === 'userMessage' && storedUserItem.attachments, [
    { id: 'attachment-1', kind: 'text', name: 'notes.md', mimeType: 'text/markdown', size: 32 },
    { id: 'attachment-2', kind: 'image', name: 'diagram.png', mimeType: 'image/png', size: 64 },
  ]);
  const persistedText = JSON.stringify((await service.readThread('thread-1')).turns);
  assert.equal(persistedText.includes('Very secret deploy notes'), false);
  assert.equal(persistedText.includes('data:image/png'), false);

  await service.startTurn({ threadId: 'thread-1', prompt: 'What did I attach earlier?' });
  const secondTurnStart = calls.filter((call) => call.method === 'turn/start')[1]?.params as { input: Array<{ type: string; text?: string; url?: string }> };
  const secondEnvelope = secondTurnStart.input[0]?.text ?? '';
  assert.match(secondEnvelope, /notes\.md/);
  assert.doesNotMatch(secondEnvelope, /Very secret deploy notes/);
  assert.doesNotMatch(secondEnvelope, /data:image\/png/);
  assert.equal(secondTurnStart.input.length, 1);
});
