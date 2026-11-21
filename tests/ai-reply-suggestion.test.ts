import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiReplySuggestion } from '../server/ai-reply-suggestion.js';
import type { AiAssistantProviderStatus } from '../shared/protocol-ai.js';
import type { ChatMessage } from '../shared/protocol-chat.js';
import { workspacePreferencesSchema } from '../shared/protocol-preferences.js';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

const status: AiAssistantProviderStatus = {
  provider: 'codex-openai-login', connected: true, detail: '', model: null, availableModels: [],
  modelsError: null, reasoningEffort: null, selectionNotice: null,
};

test('reply suggestions require opt-in and send only recent text from the selected direct conversation', async (t) => {
  const fixture = await createReplySuggestionFixture();
  t.after(fixture.close);
  const { ask, append, context, query, channel, other, prompts } = fixture;

  for (let index = 0; index < 10; index += 1) {
    append(query, { body: `Earlier ${index}`, self: true });
  }
  append(other, { body: 'Other conversation' });
  const channelMessage = append(channel, { body: 'Channel conversation' });
  const previous = append(query, { body: 'Part one' });
  const peer = append(query, { body: 'Could you send me the link again?' });
  const history = append(query, { body: 'Replayed message', delivery: 'server-history' });
  const muted = append(query, { body: 'Muted message', nick: 'muted' });
  context.storage.mutedNicks.upsert({ networkId: query.networkId, nick: 'muted' });

  assert.equal(workspacePreferencesSchema.parse({}).aiReplySuggestionsEnabled, false);
  assert.deepEqual(await ask(query, peer), { suggestion: null });
  assert.equal(prompts.length, 0);
  await fixture.enable(true);
  assert.equal(context.storage.preferences.get().aiReplySuggestionsEnabled, true);
  for (const [buffer, message] of [[query, previous], [query, history], [query, muted], [channel, channelMessage], [other, peer]] as const) {
    assert.deepEqual(await ask(buffer, message), { suggestion: null });
  }
  assert.equal(prompts.length, 0);

  assert.deepEqual(await ask(query, peer), { suggestion: 'Which link did you mean?' });
  assert.deepEqual(JSON.parse(prompts[0]), [
    ...Array.from({ length: 6 }, (_, index) => ({ speaker: 'user', text: `Earlier ${index + 4}` })),
    { speaker: 'peer', text: 'Part one' },
    { speaker: 'peer', text: 'Could you send me the link again?' },
  ]);
  const own = append(query, { self: true, body: 'I already replied.' });
  assert.deepEqual(await ask(query, own), { suggestion: null });
  assert.deepEqual(await ask(query, peer), { suggestion: null });
  assert.equal(prompts.length, 1);
  await fixture.enable(false);
  const next = append(query, { body: 'Thanks' });
  assert.deepEqual(await ask(query, next), { suggestion: null });
  assert.equal(prompts.length, 1);
});

test('muting an earlier speaker removes their text from subsequent prompts', async (t) => {
  const f = await createReplySuggestionFixture();
  t.after(f.close);
  await f.enable(true);
  const earlier = f.append(f.query, { nick: null, speakerNick: 'earlier-peer', speakerRole: 'peer',
    attributionSource: 'runtime', attributionConfidence: 'high', body: 'Private detail' });
  assert.equal(earlier.nick, null);
  assert.equal(earlier.speakerNick, 'earlier-peer');
  const peer = f.append(f.query, { body: 'Which one?' });
  await f.ask(f.query, peer);
  assert.match(f.prompts[0], /Private detail/);
  f.context.storage.mutedNicks.upsert({ networkId: f.query.networkId, nick: 'earlier-peer' });
  await f.ask(f.query, peer);
  assert.deepEqual(JSON.parse(f.prompts[1]), [{ speaker: 'peer', text: 'Which one?' }]);
});

test('a mute applied during generation discards the reply and excludes the text on retry', async t => {
  const f = await createReplySuggestionFixture();
  t.after(f.close);
  await f.enable(true);
  f.append(f.query, { nick: null, speakerNick: 'earlier', speakerRole: 'peer',
    attributionSource: 'runtime', attributionConfidence: 'high', body: 'Private context' });
  const question = f.append(f.query, { body: 'Which one?' });
  f.replyWith(async () => {
    f.context.storage.mutedNicks.upsert({ networkId: f.query.networkId, nick: 'earlier' });
    return 'Private context';
  });
  assert.deepEqual(await f.ask(f.query, question), { suggestion: null });
  assert.match(f.prompts[0], /Private context/);
  f.replyWith(async () => 'Can you clarify?');
  assert.deepEqual(await f.ask(f.query, question), { suggestion: 'Can you clarify?' });
  assert.deepEqual(JSON.parse(f.prompts[1]), [{ speaker: 'peer', text: 'Which one?' }]);
});

test('closed direct conversations never supply suggestion context', async (t) => {
  const fixture = await createReplySuggestionFixture();
  t.after(fixture.close);
  await fixture.enable(true);
  const { query, context, ask, append, prompts } = fixture;
  const peer = append(query, { body: 'Private message' });
  context.storage.conversations.removeBuffer(query.id);
  assert.deepEqual(await ask(query, peer), { suggestion: null });
  assert.deepEqual(prompts, []);
});

test('reply suggestions use arrival order when incoming and outgoing timestamps disagree', async (t) => {
  const fixture = await createReplySuggestionFixture();
  t.after(fixture.close);
  await fixture.enable(true);
  const { append, ask, query, prompts } = fixture;

  append(query, { body: 'Here is the link.', self: true, ts: 60_000 });
  const peer = append(query, { body: 'Could you send it again?', ts: 10_000 });
  assert.deepEqual(await ask(query, peer), { suggestion: 'Which link did you mean?' });
  assert.deepEqual(JSON.parse(prompts[0]), [
    { speaker: 'user', text: 'Here is the link.' },
    { speaker: 'peer', text: 'Could you send it again?' },
  ]);

  const next = append(query, { body: 'Please try the other link.', ts: 8_000 });
  assert.deepEqual(await ask(query, peer), { suggestion: null });
  assert.deepEqual(await ask(query, next), { suggestion: 'Which link did you mean?' });

  append(query, { body: 'I already replied.', self: true, ts: 5_000 });
  assert.deepEqual(await ask(query, next), { suggestion: null });
  assert.equal(prompts.length, 2);
});

test('discard a reply when an earlier message used in its prompt is deleted', async (t) => {
  const fixture = await createReplySuggestionFixture();
  t.after(fixture.close);
  await fixture.enable(true);
  const earlier = fixture.append(fixture.query, { body: 'That link was private.' });
  const peer = fixture.append(fixture.query, { body: 'Which link?' });
  fixture.replyWith(async () => {
    fixture.context.storage.conversations.deleteMessagesByIdPrefixes([earlier.id]);
    return 'The private one.';
  });
  assert.deepEqual(await fixture.ask(fixture.query, peer), { suggestion: null });
  assert.equal(fixture.prompts.length, 1);
});

test('reply suggestions discard unsafe output, errors, timeouts and stale responses', async (t) => {
  const fixture = await createReplySuggestionFixture();
  t.after(fixture.close);
  await fixture.enable(true);
  const { append, ask, query } = fixture;
  const peer = append(query, { body: 'Could you help?' });

  for (const answer of [' ', 'NO_REPLY', 'Two\nlines', 'Two\u2028lines', ' /quit', 'x'.repeat(241)]) {
    fixture.replyWith(async () => answer);
    assert.deepEqual(await ask(query, peer), { suggestion: null }, JSON.stringify(answer));
  }
  fixture.replyWith(async () => { throw new Error('Signed out'); });
  assert.deepEqual(await ask(query, peer), { suggestion: null });

  fixture.replyWith((signal) => new Promise((resolve) => {
    signal?.addEventListener('abort', () => resolve('Late reply'), { once: true });
  }), 20);
  assert.deepEqual(await ask(query, peer), { suggestion: null });

  fixture.replyWith(async () => {
    append(query, { kind: 'action', body: 'finds the answer' });
    return 'How can I help?';
  });
  assert.deepEqual(await ask(query, peer), { suggestion: null });

  const malformed = await requestJson(fixture.context.port, 'POST', fixture.path(query), { messageId: '' });
  assert.equal(malformed.status, 400);
});

test('a live direct notice invalidates a pending reply without starting a prediction', async (t) => {
  const f = await createReplySuggestionFixture();
  t.after(f.close);
  await f.enable(true);
  const peer = f.append(f.query, { body: 'Can you help?' });
  f.replyWith(async () => {
    f.append(f.query, { kind: 'notice', body: 'Never mind.' });
    return 'What do you need?';
  });
  assert.deepEqual(await f.ask(f.query, peer), { suggestion: null });
  assert.deepEqual(await f.ask(f.query, peer), { suggestion: null });
  assert.equal(f.prompts.length, 1);
});

test('identical predictions share work until their last caller cancels', async (t) => {
  const f = await createReplySuggestionFixture();
  t.after(f.close);
  await f.enable(true);
  const peer = f.append(f.query, { body: 'Which one?' });
  let finish!: (answer: string) => void;
  let providerSignal!: AbortSignal;
  f.replyWith(signal => new Promise(resolve => { providerSignal = signal!; finish = resolve; }));
  const ask = (caller: AbortController) => f.context.runtime.http.assistant.suggestReply(f.query.id, peer.id, caller.signal);
  const first = new AbortController();
  const second = new AbortController();
  const a = ask(first);
  const b = ask(second);
  assert.equal(f.prompts.length, 1);
  first.abort();
  assert.deepEqual(await a, { suggestion: null });
  assert.equal(providerSignal.aborted, false);
  finish('The second one.');
  assert.deepEqual(await b, { suggestion: 'The second one.' });

  const last = new AbortController();
  const pending = ask(last);
  assert.equal(f.prompts.length, 2);
  last.abort();
  assert.equal(providerSignal.aborted, true);
  assert.deepEqual(await pending, { suggestion: null });
  finish('Too late');
});

async function createReplySuggestionFixture() {
  const context = await createHttpRuntimeContext();
  const { port, runtime, storage } = context;
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertBuffer({ networkId: network.id, kind: 'query', target: 'alice' });
  const other = storage.conversations.upsertBuffer({ networkId: network.id, kind: 'query', target: 'bob' });
  const channel = storage.conversations.upsertBuffer({ networkId: network.id, kind: 'channel', target: '#help' });
  const prompts: string[] = [];
  let sequence = 0;
  const replyWith = (reply: (signal?: AbortSignal) => Promise<string>, timeoutMs?: number) => {
    runtime.http.assistant.suggestReply = createAiReplySuggestion({
      conversations: storage.conversations,
      getPreferences: () => storage.preferences.get(),
      listMutedNicks: (networkId) => storage.mutedNicks.list(networkId),
      provider: {
        request: async ({ prompt, signal }) => {
          prompts.push(prompt);
          return { answer: await reply(signal), status };
        },
      },
      timeoutMs,
    });
  };
  replyWith(async () => 'Which link did you mean?');
  const path = (buffer: { id: string }) => `/api/buffers/${encodeURIComponent(buffer.id)}/reply-suggestion`;
  return {
    context, query, channel, other, prompts, replyWith, path, close: context.close,
    enable: async (enabled: boolean) => {
      const response = await requestJson(port, 'PATCH', '/api/preferences', { aiReplySuggestionsEnabled: enabled });
      assert.equal(response.status, 200);
    },
    append: (buffer: typeof query, overrides: Partial<ChatMessage>) => storage.conversations.appendMessage({
      id: `message-${++sequence}`, ts: sequence, kind: 'line', self: false, nick: buffer.target,
      target: buffer.target, networkId: buffer.networkId, body: '', ...overrides,
      ...(overrides.self ? { nick: network.nick } : {}),
    }, buffer.id),
    ask: async (buffer: typeof query, message: ChatMessage) => {
      const response = await fetch(`http://127.0.0.1:${port}${path(buffer)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id }),
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return await response.json();
    },
  };
}
