import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import test from 'node:test';
import type { AssistantSnapshot, AssistantThreadSummary, BufferState, ServerMessage } from '../shared/protocol.js';
import { AssistantService } from '../server/assistant-service.js';
import { conversationStore, createAssistantStore, makeBuffer, makeThread, networkStore } from './helpers/assistant-service-test-stores.js';
import { flushAssistantEvents } from './helpers/assistant-service-test-runtime.js';

test('assistant service fails in-flight turns when the app-server becomes unavailable', () => {
  const assistantStore = createAssistantStore([
    makeThread({ id: 'thread-1', turnStatus: 'inProgress' }),
    makeThread({ id: 'thread-2', target: '#random', title: 'Ask · #random', turnStatus: 'inProgress' }),
  ]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: (message) => { published.push(message); }, autoStart: false });
  const privateService = service as unknown as {
    auth: AssistantSnapshot['auth'];
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleUnavailable: (error: Error | null) => void;
  };

  privateService.auth = { ...service.snapshot().auth, pendingLoginId: 'login-1', pendingAuthUrl: 'https://auth.example.test' };
  privateService.handleTurnStarted({ threadId: 'thread-1', turn: { id: 'turn-1', status: 'inProgress', error: null, items: [] } });
  published.length = 0;
  privateService.handleUnavailable(new Error('codex crashed'));

  assert.equal(assistantStore.threads.get('thread-1')?.turnStatus, 'failed');
  assert.equal(assistantStore.threads.get('thread-2')?.turnStatus, 'failed');
  assert.equal(published.length, 1);
  assert.ok(Array.isArray(published[0]));
  const messages = published[0];
  assert.ok(Array.isArray(messages));
  assert.deepEqual(messages.map((message) => message.type), ['assistant.turn.completed', 'assistant.snapshot']);
  const completed = messages[0];
  const snapshot = messages[1];
  assert.equal(completed?.type, 'assistant.turn.completed');
  assert.equal(completed?.type === 'assistant.turn.completed' && completed.turn.status, 'failed');
  assert.equal(completed?.type === 'assistant.turn.completed' && completed.turn.error, 'codex crashed');
  assert.equal(snapshot?.type, 'assistant.snapshot');
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.serviceStatus, 'error');
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.auth.pendingLoginId, null);
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.auth.pendingAuthUrl, null);
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-1')?.turnStatus, 'failed');
  assert.equal(snapshot?.type === 'assistant.snapshot' && snapshot.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-2')?.turnStatus, 'failed');
});

test('assistant service fails stale persisted in-progress turns during startup reconciliation', () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: 'inProgress' })]);
  assistantStore.saveThreadTurns('thread-1', [{
    id: 'turn-1',
    status: 'inProgress',
    error: null,
    items: [{ type: 'userMessage', id: 'turn-1:user', text: 'Do you remember this?', attachments: [] }],
  }]);

  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: () => {}, autoStart: false });
  const storedThread = assistantStore.getThread('thread-1');
  const storedTurn = assistantStore.getThreadTurns('thread-1')?.[0];

  assert.equal(service.snapshot().threads.find((thread) => thread.id === 'thread-1')?.turnStatus, 'failed');
  assert.equal(storedThread?.turnStatus, 'failed');
  assert.equal(storedTurn?.status, 'failed');
  assert.equal(storedTurn?.error, 'Assistant service restarted before this turn finished');
});

test('assistant service converts ready-event failures into error snapshots', async () => {
  const assistantStore = createAssistantStore([]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: (message) => { published.push(message); }, autoStart: false });
  const privateService = service as unknown as { appServer: { emit: (event: string) => boolean; call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer.call = async (method: string) => {
    if (method === 'account/read') throw new Error('account/read failed');
    if (method === 'account/rateLimits/read') return { rateLimits: { limitId: null, primary: null, secondary: null, credits: null, planType: null } };
    if (method === 'model/list') return { data: [] };
    throw new Error(`Unexpected app-server method: ${method}`);
  };

  privateService.appServer.emit('ready');
  await flushAssistantEvents();

  assert.equal(published.length, 1);
  const snapshotMessage = published[0];
  assert.ok(snapshotMessage && !Array.isArray(snapshotMessage));
  const assistantSnapshot = snapshotMessage as Extract<ServerMessage, { type: 'assistant.snapshot' }>;
  assert.equal(assistantSnapshot.type, 'assistant.snapshot');
  assert.equal(assistantSnapshot.assistant.serviceStatus, 'error');
  assert.equal(assistantSnapshot.assistant.serviceError, 'account/read failed');
});

test('assistant service returns queued turn messages immediately and marks the turn failed if launch fails', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', turnStatus: null })]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: (message) => { published.push(message); }, autoStart: false });
  const calls: Array<{ method: string; params: unknown }> = [];
  const privateService = service as unknown as { appServer: { call: (method: string, params?: unknown) => Promise<unknown> } };

  privateService.appServer = {
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'execution-1' } };
      if (method === 'turn/start') throw new Error('Signed out');
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  const result = await service.startTurn({ threadId: 'thread-1', clientTurnId: 'assistant-turn:client-hello', prompt: 'Hello' });
  await flushAssistantEvents();

  assert.deepEqual(result.messages.map((message) => message.type), ['assistant.turn.started']);
  const queuedTurn = result.messages[0];
  assert.equal(queuedTurn?.type, 'assistant.turn.started');
  assert.equal(queuedTurn?.type === 'assistant.turn.started' && queuedTurn.turn.id, 'assistant-turn:client-hello');
  assert.equal(queuedTurn?.type === 'assistant.turn.started' && queuedTurn.turn.items[0]?.type, 'userMessage');
  assert.equal(queuedTurn?.type === 'assistant.turn.started' && queuedTurn.turn.items[0]?.type === 'userMessage' && queuedTurn.turn.items[0].text, 'Hello');
  assert.equal(assistantStore.threads.get('thread-1')?.turnStatus, 'failed');
  assert.equal(published.length, 1);
  const completionMessages = published[0];
  assert.ok(Array.isArray(completionMessages));
  assert.deepEqual(completionMessages.map((message) => message.type), ['assistant.turn.completed', 'assistant.snapshot']);
  const completedTurn = completionMessages[0];
  const completedSnapshot = completionMessages[1];
  assert.equal(completedTurn?.type, 'assistant.turn.completed');
  assert.equal(completedTurn?.type === 'assistant.turn.completed' && completedTurn.turn.status, 'failed');
  assert.equal(completedTurn?.type === 'assistant.turn.completed' && completedTurn.turn.error, 'Signed out');
  assert.equal(completedSnapshot?.type, 'assistant.snapshot');
  assert.equal(completedSnapshot?.type === 'assistant.snapshot' && completedSnapshot.assistant.threads.find((thread: AssistantThreadSummary) => thread.id === 'thread-1')?.turnStatus, 'failed');
  assert.equal(assistantStore.getThreadTurns('thread-1')?.[0]?.status, 'failed');
  assert.equal(assistantStore.getThreadTurns('thread-1')?.[0]?.error, 'Signed out');
  const threadStartParams = calls[0]?.params as { model: string; modelProvider: string; cwd: string; approvalPolicy: string; sandbox: string; personality: string; serviceName: string; baseInstructions: string };
  assert.equal(threadStartParams.model, 'gpt-5.4');
  assert.equal(threadStartParams.modelProvider, 'openai');
  assert.equal(threadStartParams.cwd, tmpdir());
  assert.equal(threadStartParams.approvalPolicy, 'never');
  assert.equal(threadStartParams.sandbox, 'read-only');
  assert.equal(threadStartParams.personality, 'pragmatic');
  assert.equal(threadStartParams.serviceName, 'pulsete_assistant');
  assert.match(threadStartParams.baseInstructions, /Only use IRC transcript excerpts when they are explicitly included/);
  const turnStartParams = calls[1]?.params as { threadId: string; input: Array<{ type: string; text: string }>; cwd: string; approvalPolicy: string; sandboxPolicy: unknown; model: string; personality: string; outputSchema?: null };
  assert.equal(turnStartParams.threadId, 'execution-1');
  assert.equal(turnStartParams.cwd, tmpdir());
  assert.equal(turnStartParams.approvalPolicy, 'never');
  assert.deepEqual(turnStartParams.sandboxPolicy, { type: 'readOnly', access: { type: 'restricted', includePlatformDefaults: false, readableRoots: [] }, networkAccess: false });
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

test('assistant service simplifies structured turn errors from the app-server', async () => {
  const assistantStore = createAssistantStore([makeThread({ id: 'thread-1', bufferId: 'buffer-1', networkId: 'network-1', target: 'RichJake', title: 'Ask · RichJake', turnStatus: null })]);
  const buffer: BufferState = makeBuffer({ target: 'RichJake' });
  const service = new AssistantService({
    assistant: assistantStore,
    conversations: { ...conversationStore, getBuffer: (bufferId) => bufferId === buffer.id ? buffer : null, upsertQuery: () => buffer, appendMessage: (input) => input },
    networks: networkStore,
    publish: () => {},
    autoStart: false,
  });
  const privateService = service as unknown as {
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleTurnStarted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => void;
    handleTurnCompleted: (params: { threadId: string; turn: { id: string; status: string; error: unknown; items: [] } }) => Promise<void>;
  };

  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'thread/start') return { thread: { id: 'execution-import-error' } };
      if (method === 'turn/start') return {};
      throw new Error(`Unexpected app-server method: ${method}`);
    },
  };

  await service.startTurn({ threadId: 'thread-1', prompt: 'What went wrong?', attachments: [{ id: 'attachment-1', kind: 'text', name: 'richjake.log', mimeType: 'text/plain', size: 20, text: '<RichJake> hi' }] });
  privateService.handleTurnStarted({ threadId: 'execution-import-error', turn: { id: 'turn-import-error', status: 'inProgress', error: null, items: [] } });
  await privateService.handleTurnCompleted({
    threadId: 'execution-import-error',
    turn: {
      id: 'turn-import-error',
      status: 'failed',
      error: { message: JSON.stringify({ error: { type: 'invalid_request_error', message: "Unsupported value: 'xhigh' is not supported with the active model.", param: 'reasoning.effort' }, status: 400 }) },
      items: [],
    },
  });

  const failedTurn = (await service.readThread('thread-1')).turns[0];
  assert.equal(failedTurn?.status, 'failed');
  assert.equal(failedTurn?.error, "Unsupported value: 'xhigh' is not supported with the active model.");
});

test('assistant service ignores stale login completions from superseded auth flows', async () => {
  const assistantStore = createAssistantStore([]);
  const published: Array<ServerMessage | readonly ServerMessage[]> = [];
  const service = new AssistantService({ assistant: assistantStore, conversations: conversationStore, networks: networkStore, publish: (message) => { published.push(message); }, autoStart: false });
  const privateService = service as unknown as {
    auth: AssistantSnapshot['auth'];
    appServer: { call: (method: string, params?: unknown) => Promise<unknown> };
    handleLoginCompleted: (params: { loginId?: string; success: boolean; error?: string | null }) => Promise<void>;
  };

  privateService.auth = { ...service.snapshot().auth, pendingLoginId: 'login-2', pendingAuthUrl: 'https://auth-2.example.test' };
  privateService.appServer = {
    call: async (method: string) => {
      if (method === 'account/read') return { requiresOpenaiAuth: true, account: null };
      if (method === 'account/rateLimits/read') throw new Error('No rate limits');
      if (method === 'model/list') return { data: [] };
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
