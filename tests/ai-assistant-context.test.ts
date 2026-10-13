import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAiAssistantContext,
  renderAiAssistantContext,
  renderAiAssistantMessages,
} from '../server/ai-assistant-context.js';
import { RuntimeAiAssistantService } from '../server/runtime-ai-assistant-service.js';
import type { RuntimeConversationStore } from '../server/runtime-store.js';
import type { BufferState, ChatMessage } from '../shared/protocol-chat.js';
import type { AiAssistantProviderStatus } from '../shared/protocol-ai.js';

const channelBuffer: BufferState = {
  id: 'buffer-1',
  kind: 'channel',
  lastReadMessageId: null,
  lastReadTs: null,
  networkId: 'network-1',
  priorityUnread: 0,
  target: '#lobby',
  unread: 0,
};

const message: ChatMessage = {
  body: 'Meet at the bridge',
  bufferId: channelBuffer.id,
  id: 'message-1',
  kind: 'line',
  networkId: channelBuffer.networkId,
  nick: 'Mira',
  self: false,
  target: channelBuffer.target,
  ts: Date.UTC(2026, 0, 1, 12, 0, 0),
};

test('assistant context includes recent messages for a channel buffer', () => {
  const store = createConversationStore(channelBuffer, [message]);
  const context = buildAiAssistantContext(store, channelBuffer.id);

  assert.deepEqual(context.buffer, {
    id: channelBuffer.id,
    kind: 'channel',
    networkId: channelBuffer.networkId,
    target: channelBuffer.target,
  });
  assert.deepEqual(context.messages, [message]);
});

test('assistant context rejects server buffers', () => {
  const store = createConversationStore({ ...channelBuffer, kind: 'server', target: 'server' }, []);
  assert.throws(
    () => buildAiAssistantContext(store, channelBuffer.id),
    /channels and private messages/,
  );
});

test('assistant message rendering keeps timestamps, speaker, and body', () => {
  assert.equal(
    renderAiAssistantMessages([message]),
    '[2026-01-01T12:00:00.000Z] Mira: Meet at the bridge',
  );
});

test('assistant context searches the selected log for prompt terms', () => {
  const olderMessage = createMessage('message-old', 'The deployment password was alpha', 10);
  const store = createConversationStore(channelBuffer, [message], {
    search: { password: [olderMessage] },
  });
  const context = buildAiAssistantContext(store, channelBuffer.id, {
    mode: 'answer',
    prompt: 'Where was the password?',
  });

  assert.deepEqual(context.search.terms, ['password']);
  assert.deepEqual(context.search.messages, [olderMessage]);
  assert.match(renderAiAssistantContext(context), /Targeted history search \(password\)/);
  assert.match(renderAiAssistantContext(context), /deployment password was alpha/);
});

test('assistant context includes the full selected log for broad count questions', () => {
  const oldMessage = createMessage('message-old', 'We met once in March', 10);
  const store = createConversationStore(channelBuffer, [message], {
    allMessages: [oldMessage, message],
  });
  const context = buildAiAssistantContext(store, channelBuffer.id, {
    mode: 'answer',
    prompt: 'How many times did we meet?',
  });

  assert.deepEqual(context.fullLog?.messages, [oldMessage, message]);
  assert.match(renderAiAssistantContext(context), /Full saved log for this conversation/);
  assert.match(renderAiAssistantContext(context), /We met once in March/);
});

test('assistant context includes the full selected log for date references', () => {
  const juneMessage = createMessage(
    'message-june-12',
    'June 12 scene details are in this old entry',
    Date.UTC(2026, 5, 12, 15, 31, 0),
  );
  const store = createConversationStore(channelBuffer, [message], {
    allMessages: [juneMessage, message],
  });
  const context = buildAiAssistantContext(store, channelBuffer.id, {
    mode: 'answer',
    prompt: 'Describe the one from June 12 2026',
  });

  assert.deepEqual(context.fullLog?.messages, [juneMessage]);
  assert.match(renderAiAssistantContext(context), /June 12 scene details/);
});

test('assistant follow-ups do not load the whole history automatically', () => {
  const oldMessage = createMessage('message-old', 'Runner-up details live here', 10);
  const store = createConversationStore(channelBuffer, [message], {
    allMessages: [oldMessage, message],
  });
  const context = buildAiAssistantContext(store, channelBuffer.id, {
    assistantTurns: [
      { role: 'assistant', text: 'Runner-up: June 12 at 15:31.' },
    ],
    mode: 'answer',
    prompt: 'Describe that one',
  });

  assert.equal(context.fullLog, null);
});

test('assistant requests include prior sidebar Q&A for clarification prompts', async () => {
  let capturedPrompt = '';
  const provider = {
    model: null,
    request: async (input: { prompt: string }) => {
      capturedPrompt = input.prompt;
      return { answer: 'answer', status: connectedStatus };
    },
    startLogin: async () => ({ instructions: null, status: connectedStatus }),
    status: async () => connectedStatus,
  };
  const service = new RuntimeAiAssistantService({
    conversations: createConversationStore(channelBuffer, [message]),
    provider,
  });

  await service.ask(channelBuffer.id, {
    assistantTurns: [
      { role: 'user', text: 'How many times has TGMistress ejaculated?' },
      { role: 'assistant', text: 'In the latest scene, three times.' },
    ],
    mode: 'answer',
    prompt: 'I mean, ever, since they know each other',
    selection: { model: null, reasoningEffort: null },
  });

  assert.match(capturedPrompt, /Assistant conversation so far:/);
  assert.match(capturedPrompt, /How many times has TGMistress ejaculated\?/);
  assert.match(capturedPrompt, /In the latest scene, three times\./);
  assert.match(capturedPrompt, /User request: I mean, ever, since they know each other/);
});

const createConversationStore = (
  buffer: BufferState | null,
  messages: ChatMessage[],
  options: {
    allMessages?: ChatMessage[];
    search?: Record<string, ChatMessage[]>;
  } = {},
) => ({
  getBuffer: (bufferId: string) => buffer?.id === bufferId ? buffer : null,
  getMessageWindow: (messageId: string) =>
    Object.values(options.search ?? {}).flat().filter((entry) => entry.id === messageId),
  listAssistantHistory: (_bufferId: string, limit: number, range?: { start: number; end: number } | null) => {
    const all = (options.allMessages ?? messages).filter((entry) => !range || (entry.ts >= range.start && entry.ts < range.end));
    return { messages: all.slice(-limit), hasMore: all.length > limit };
  },
  listRecentMessagesForBuffer: () => messages,
  searchMessagesByBufferId: (_bufferId: string, query: string) => ({
    hasMore: false,
    messages: options.search?.[query] ?? [],
  }),
}) as unknown as RuntimeConversationStore;

const createMessage = (id: string, body: string, ts: number): ChatMessage => ({
  ...message,
  body,
  id,
  ts,
});

const connectedStatus: AiAssistantProviderStatus = {
  availableModels: [],
  connected: true,
  detail: 'connected',
  model: null,
  modelsError: null,
  provider: 'codex-openai-login',
  reasoningEffort: null,
  selectionNotice: null,
};

test('explicit recent scope never retrieves older saved messages', () => {
  const oldMessage = createMessage('old-scope', 'Earlier bridge plans', 10);
  const store = createConversationStore(channelBuffer, [message], {
    allMessages: [oldMessage, message], search: { bridge: [oldMessage] },
  });
  store.listAssistantHistory = () => { throw new Error('Recent scope must not read history'); };
  store.searchMessagesByBufferId = () => { throw new Error('Recent scope must not search history'); };
  const context = buildAiAssistantContext(store, channelBuffer.id, {
    mode: 'answer', prompt: 'Summarize everything about the bridge since the beginning', scope: 'recent',
  });
  assert.equal(context.fullLog, null);
  assert.deepEqual(context.search, { messages: [], terms: [] });
  assert.deepEqual(context.sources?.map(({ message: entry }) => entry.id), [message.id]);
  assert.equal(context.coverage?.description, 'Recent messages only');
});

test('explicit saved scope includes history even for a short generic prompt and reports limits', () => {
  const history = Array.from({ length: 650 }, (_, index) => createMessage(`old-${index}`, 'Earlier detail', index));
  const context = buildAiAssistantContext(createConversationStore(channelBuffer, [message], {
    allMessages: history,
  }), channelBuffer.id, { mode: 'answer', prompt: 'Summarize', scope: 'saved' });
  assert.ok(context.fullLog?.messages.length);
  assert.equal(context.coverage?.description, 'Saved conversation history');
  assert.equal(context.coverage?.truncated, true);
});

test('assistant service forwards the selected recent scope to retrieval', async () => {
  const store = createConversationStore(channelBuffer, [message]);
  store.listAssistantHistory = () => { throw new Error('Recent scope must survive request routing'); };
  store.searchMessagesByBufferId = () => { throw new Error('Recent scope must survive request routing'); };
  const service = new RuntimeAiAssistantService({ conversations: store, provider: {
    model: null,
    request: async () => ({ answer: 'Summary', status: connectedStatus }),
    status: async () => connectedStatus,
    startLogin: async () => ({ instructions: null, status: connectedStatus }),
  } });
  const result = await service.ask(channelBuffer.id, { scope: 'recent', mode: 'answer', prompt: 'Summarize all saved history', assistantTurns: [], selection: { model: null, reasoningEffort: null } });
  assert.equal(result.context.coverage?.description, 'Recent messages only');
});
