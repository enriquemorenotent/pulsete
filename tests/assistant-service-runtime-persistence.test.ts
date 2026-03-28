import assert from 'node:assert/strict';
import test from 'node:test';
import { AssistantService } from '../server/assistant-service.js';
import { conversationStore, createAssistantStore, makeThread, networkStore } from './helpers/assistant-service-test-stores.js';

test('assistant service persists in-progress turns so thread reloads keep the pending prompt', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
  };

  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'execution-1' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', clientTurnId: 'assistant-turn:client-1', prompt: 'Summarize what happened earlier.' });
  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });

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
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleItemStarted: (params: { threadId: string; turnId: string; item: { type: 'agentMessage'; id: string; text: string; phase: null } }) => void;
    handleItemDelta: (params: { threadId: string; turnId: string; itemId: string; delta: string }) => void;
  };

  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'execution-1' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Tell me the current status.' });
  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  privateService.handleItemStarted({ threadId: 'execution-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'agent-1', text: '', phase: null } });
  privateService.handleItemDelta({ threadId: 'execution-1', turnId: 'turn-1', itemId: 'agent-1', delta: 'Answer:The strongest hotel mention is on 2026-03-23.It looks direct.' });

  const agentMessage = (await service.readThread('thread-1')).turns[0]?.items.find((item) => item.type === 'agentMessage');
  assert.equal(agentMessage?.type, 'agentMessage');
  assert.equal(agentMessage?.type === 'agentMessage' && agentMessage.text, 'Answer:\nThe strongest hotel mention is on 2026-03-23. It looks direct.');
});

test('assistant service normalizes completed ask replies for readability', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleItemStarted: (params: { threadId: string; turnId: string; item: { type: 'agentMessage'; id: string; text: string; phase: null } }) => void;
    handleItemCompleted: (params: { threadId: string; turnId: string; item: { type: 'agentMessage'; id: string; text: string; phase: null } }) => void;
  };

  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'execution-1' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'Tell me what happened.' });
  privateService.handleTurnStarted({ threadId: 'execution-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  privateService.handleItemStarted({ threadId: 'execution-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'agent-1', text: '', phase: null } });
  privateService.handleItemCompleted({ threadId: 'execution-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'agent-1', text: 'Provided.The strongest match is “hotel fantasy.”That part matters.', phase: null } });

  const agentMessage = (await service.readThread('thread-1')).turns[0]?.items.find((item) => item.type === 'agentMessage');
  assert.equal(agentMessage?.type, 'agentMessage');
  assert.equal(agentMessage?.type === 'agentMessage' && agentMessage.text, 'Provided. The strongest match is “hotel fantasy.” That part matters.');
});

test('assistant service normalizes persisted local ask replies when reading a thread', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: 'completed' })]);
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

  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
  const thread = await service.readThread('thread-1');
  const item = thread.turns[0]?.items[0];
  const expected = 'Answer:\nThe clearest match is from March 23, 2026.\n\nEvidence:\n- 2026-03-23 06:11 — you: "our bed, only for us 2"\n\nLimits:\n- partial evidence only.';
  assert.equal(item?.type, 'agentMessage');
  assert.equal(item?.type === 'agentMessage' && item.text, expected);
  const persistedItem = assistantStore.getThreadTurns('thread-1')?.[0]?.items[0];
  assert.equal(persistedItem?.type === 'agentMessage' && persistedItem.text, expected);
});
