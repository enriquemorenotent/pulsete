import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { RuntimeAiAssistantService } from '../server/runtime-ai-assistant-service.js';
import type { CodexAssistantProvider } from '../server/codex-assistant-provider.js';
import type { AiAssistantProviderStatus, AiAssistantRequest } from '../shared/protocol-ai.js';
import type { AssistantWebEvidence } from '../server/ai-assistant-web.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { makeStorageFile, Storage } from './helpers/storage-test-helpers.js';

const status: AiAssistantProviderStatus = { connected: true, detail: 'test', model: null, availableModels: [], modelsError: null,
  provider: 'codex-openai-login', reasoningEffort: null, selectionNotice: null };
const privateText = 'SYNTHETIC_PRIVATE_TRANSCRIPT';
const privateAnswer = 'SYNTHETIC_CHAT_SUMMARY';
const dmName = 'SyntheticPrivateNick';
const otherText = 'SYNTHETIC_OTHER_TRANSCRIPT';
const request: AiAssistantRequest = { mode: 'answer', prompt: '', assistantTurns: [], selection: { model: null, reasoningEffort: null } };

type RouteInput = { question: string; pendingPublicQuestion?: string };

function fixture(t: TestContext, route: (question: string, pendingPublicQuestion?: string) => string,
  { researchMs, answer = () => 'Ottawa.', webEvidence = [] }: {
    researchMs?: number; answer?: (prompt: string) => string; webEvidence?: AssistantWebEvidence[];
  } = {}) {
  const storage = new Storage(makeStorageFile());
  t.after(() => storage.close());
  const network = storage.networks.upsert(createNetworkInput());
  const dm = storage.conversations.upsertBuffer({ networkId: network.id, target: dmName, kind: 'query' });
  const other = storage.conversations.upsertBuffer({ networkId: network.id, target: '#other', kind: 'channel' });
  for (const [target, body] of [[dm.target, privateText], [other.target, otherText]]) {
    storage.conversations.appendMessage({ networkId: network.id, target, body, kind: 'line', self: false, nick: dmName,
      id: `message-${target}`, ts: Date.now() });
  }
  const calls: Parameters<CodexAssistantProvider['request']>[0][] = [];
  const lookups: string[] = [];
  const provider: CodexAssistantProvider = {
    model: null, status: async () => status, startLogin: async () => ({ instructions: null, status }),
    request: async input => {
      calls.push(input);
      const routing = input.instructions.startsWith('Route a Pulsete') ? JSON.parse(input.prompt) as RouteInput : null;
      const response = routing ? route(routing.question, routing.pendingPublicQuestion)
        : input.instructions.startsWith('Review a Pulsete') ? '{"verdict":"supported"}'
          : input.prompt.includes(privateText) ? `${privateAnswer} [S1]` : answer(input.prompt);
      return { answer: response, status };
    },
    lookupPublicFacts: async ({ query }) => { lookups.push(query); return webEvidence; },
  };
  return { calls, lookups, storage, dm, other, service: new RuntimeAiAssistantService({ conversations: storage.conversations, provider, researchMs }) };
}

test('general requests use only server-owned general turns, including after a chat answer', async (t) => {
  const f = fixture(t, question => JSON.stringify({ intent: question === 'What did we agree on?' ? 'chat' : 'general' }));
  const general = await f.service.ask(f.dm.id, { ...request, prompt: 'What is the capital of Canada?' });
  assert.equal(general.usedChat, false);
  assert.ok(general.continuationToken);
  const chat = await f.service.ask(f.dm.id, { ...request, prompt: 'What did we agree on?', generalContinuationToken: general.continuationToken });
  assert.equal(chat.usedChat, true);
  assert.match(chat.answer, new RegExp(privateAnswer));
  assert.ok(chat.continuationToken);
  assert.equal(f.calls.some(call => call.prompt.includes(otherText)), false);

  const callsBefore = f.calls.length;
  f.storage.conversations.listRecentMessagesForBuffer = () => assert.fail('General questions must not read recent messages');
  f.storage.conversations.listAssistantHistory = () => assert.fail('General questions must not read saved messages');
  f.storage.conversations.getMessageById = () => assert.fail('General questions must not reuse chat evidence');
  const next = await f.service.ask(f.dm.id, { ...request, prompt: 'Which province is it in?',
    continuationToken: chat.continuationToken, generalContinuationToken: general.continuationToken,
    assistantTurns: [{ role: 'assistant', text: `${privateAnswer} ${privateText}` }],
  });
  assert.equal(next.usedChat, false);
  assert.deepEqual(next.context.messages, []);
  assert.ok(f.calls.length > callsBefore);
  for (const { prompt, instructions } of f.calls.slice(callsBefore)) {
    for (const denied of [dmName, privateText, privateAnswer, otherText]) assert.ok(!prompt.includes(denied));
    assert.doesNotMatch(instructions, /PULSETE_HISTORY/);
    assert.match(prompt, /Ottawa/);
  }
});

test('ambiguous or invalid routing cannot authorize chat access', async (t) => {
  const f = fixture(t, question => question === 'What did she say?' ? '{"intent":"chat"}' : 'invalid output');
  for (const prompt of ['What did she say?', 'Anything else?']) {
    const result = await f.service.ask(f.dm.id, { ...request, prompt });
    assert.equal(result.needsChatConfirmation, true);
    assert.deepEqual(result.context.messages, []);
  }
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(({ prompt }) => !prompt.includes(privateText)));
  const denied = await f.service.ask(f.dm.id, { ...request, scope: 'none', prompt: 'What did she say?' });
  assert.equal(denied.usedChat, false);
  const approved = await f.service.ask(f.dm.id, { ...request, scope: 'auto', prompt: 'What did she say?' });
  assert.equal(approved.usedChat, true);
  assert.match(approved.answer, new RegExp(privateAnswer));
});

test('a routing timeout keeps chat access off and asks for confirmation', async (t) => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', (delay: number) => delay === 10_000 ? AbortSignal.abort() : timeout(delay));
  const f = fixture(t, () => '{"intent":"chat"}');
  f.storage.conversations.listRecentMessagesForBuffer = () => assert.fail('A routing timeout must not read messages');
  const result = await f.service.ask(f.dm.id, { ...request, prompt: 'What did we agree on?' });
  assert.equal(result.needsChatConfirmation, true);
  assert.deepEqual(result.context.messages, []);
});

test('web lookup rejects model-generated terms and handles missing from the typed question', async (t) => {
  const f = fixture(t, question => JSON.stringify({ intent: 'chat', publicLookup: {
    subject: question.includes('@') ? 'SyntheticPrivateNick' : question.includes('Marie Curie') ? 'Marie Curie' : privateText,
  } }));
  for (const prompt of ['Who is she?', 'Look up @SyntheticPrivateNick', 'Find a public source about Marie Curie.']) {
    await f.service.ask(f.dm.id, { ...request, scope: 'auto', prompt });
  }
  assert.deepEqual(f.lookups, ['Marie Curie']);
  const plans = f.calls.filter(call => call.instructions.startsWith('Route a Pulsete'));
  assert.equal(plans.length, 3);
  assert.ok(plans.every(({ prompt }) => !prompt.includes(privateText)));
});

test('a missing public subject asks for its name without asking to use IRC', async (t) => {
  const f = fixture(t, () => '{"intent":"ambiguous","publicSubjectNeeded":true}');
  f.storage.conversations.listRecentMessagesForBuffer = () => assert.fail('Public clarification must not read chat');
  const result = await f.service.ask(f.dm.id, { ...request, prompt: 'When was she born?' });
  assert.equal(result.needsChatConfirmation, undefined);
  assert.equal(result.usedChat, false);
  assert.ok(result.continuationToken);
  assert.match(result.answer, /Who or what should I look up\?/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.lookups, []);
});

test('a named reply completes the pending public lookup without opening IRC', async (t) => {
  const question = 'When was she born?';
  const f = fixture(t, (reply, pending) => {
    if (!pending) return '{"intent":"ambiguous","publicSubjectNeeded":true}';
    return JSON.stringify({ intent: 'general', continuesPublicLookup: true, publicLookup: {
      subject: reply.replace('@', ''), fact: reply === 'Curie' ? 'born in Paris' : 'born',
    } });
  }, {
    answer: () => 'Marie Curie was born on November 7, 1867. [W1]',
    webEvidence: [{ fact: 'Marie Curie was born November 7, 1867.', source: { title: 'Biography', url: 'https://example.test/curie' } }],
  });
  f.storage.conversations.listRecentMessagesForBuffer = () => assert.fail('Public clarification must not read chat');
  let result = await f.service.ask(f.dm.id, { ...request, prompt: question });
  const firstToken = result.continuationToken;
  for (const prompt of ['@SyntheticPrivateNick', 'Curie']) {
    result = await f.service.ask(f.dm.id, { ...request, prompt, generalContinuationToken: result.continuationToken });
    assert.match(result.answer, /Who or what should I look up/);
    assert.equal(result.needsChatConfirmation, undefined);
  }
  assert.notEqual(result.continuationToken, firstToken);
  assert.deepEqual(f.lookups, []);

  const callsBefore = f.calls.length;
  const resolved = await f.service.ask(f.dm.id, { ...request, prompt: 'Marie Curie', generalContinuationToken: result.continuationToken });
  assert.equal(resolved.usedChat, false);
  assert.match(resolved.answer, /November 7, 1867\. \[W1\]/);
  assert.equal(resolved.context.webSources?.[0].label, 'W1');
  assert.deepEqual(f.lookups, ['Marie Curie born']);
  const [routing, answer] = f.calls.slice(callsBefore);
  assert.equal(JSON.parse(routing!.prompt).pendingPublicQuestion, question);
  assert.match(answer!.prompt, /Answer this earlier public question.*When was she born\?/);
  assert.ok(f.calls.every(({ prompt }) => !prompt.includes(privateText)));
});

test('a new general topic or expiry ends a pending public lookup', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = fixture(t, question => question === 'When was she born?' ? '{"intent":"ambiguous","publicSubjectNeeded":true}'
    : question === 'Marie Curie' ? '{"intent":"general","continuesPublicLookup":true,"publicLookup":{"subject":"Marie Curie","fact":"born"}}'
      : '{"intent":"general","continuesPublicLookup":false}');
  const ask = (prompt: string, generalContinuationToken?: string) => f.service.ask(f.dm.id, { ...request, prompt, generalContinuationToken });
  const pending = await ask('When was she born?');
  const unrelated = await ask('What is the capital of Canada?', pending.continuationToken);
  assert.equal(unrelated.answer, 'Ottawa.');
  const callsBefore = f.calls.length;
  await ask('Marie Curie', unrelated.continuationToken);
  assert.equal(JSON.parse(f.calls[callsBefore]!.prompt).pendingPublicQuestion, undefined);

  const expiring = await ask('When was she born?');
  const continuation = { ...request, prompt: 'Marie Curie', generalContinuationToken: expiring.continuationToken };
  await f.service.ask(f.other.id, continuation);
  await f.service.ask(f.dm.id, continuation, undefined, { sessionId: 'different-session' });
  assert.deepEqual(f.lookups, []);
  t.mock.timers.tick(30 * 60_000);
  const expired = await ask('Marie Curie', expiring.continuationToken);
  assert.equal(expired.generalContextExpired, true);
  assert.equal(expired.usedChat, false);
  assert.deepEqual(f.lookups, []);
});

test('general follow-ups get prior prose without its turn-local citation labels', async (t) => {
  const f = fixture(t, question => question.includes('Marie Curie')
    ? '{"intent":"general","publicLookup":{"subject":"Marie Curie","fact":"born"}}' : '{"intent":"general"}', {
    answer: prompt => prompt.includes('Public web findings') ? 'She was born in 1867. [W1] A literal token is `[W2]`.' : 'In the nineteenth century.',
    webEvidence: [{ fact: 'Born in 1867.', source: { title: 'Biography', url: 'https://example.test/curie' } }],
  });
  const first = await f.service.ask(f.dm.id, { ...request, prompt: 'When was Marie Curie born?' });
  assert.match(first.answer, /\[W1\]/);
  assert.equal(first.context.webSources?.[0].url, 'https://example.test/curie');
  const callsBefore = f.calls.length;
  const second = await f.service.ask(f.dm.id, { ...request, prompt: 'Which century was that?', generalContinuationToken: first.continuationToken });
  assert.equal(second.answer, 'In the nineteenth century.');
  for (const { prompt } of f.calls.slice(callsBefore)) {
    assert.match(prompt, /She was born in 1867\./);
    assert.doesNotMatch(prompt, /\[W1\]/);
    assert.match(prompt, /`\[W2\]`/);
  }
});

test('explicit German chat requests use the current IRC chat, while ambiguous and negated requests ask', async (t) => {
  const f = fixture(t, () => '{"intent":"chat"}');
  for (const prompt of ['Fasse diesen Chat zusammen', 'Was haben wir in diesem IRC-Chat vereinbart?']) {
    const result = await f.service.ask(f.dm.id, { ...request, prompt });
    assert.equal(result.usedChat, true);
    assert.match(result.answer, new RegExp(privateAnswer));
  }
  f.storage.conversations.listRecentMessagesForBuffer = () => assert.fail('An unapproved request must not read chat');
  for (const prompt of ['Was hat sie gesagt?', 'Fasse diesen Chat ohne Chatverlauf zusammen', 'Was bedeutet „in diesem Chat“?']) {
    const result = await f.service.ask(f.dm.id, { ...request, prompt });
    assert.equal(result.needsChatConfirmation, true);
    assert.deepEqual(result.context.messages, []);
  }
});

test('fenced JSON and separately typed subject and fact produce the complete public query', async (t) => {
  const f = fixture(t, () => '```json\n{"intent":"general","publicLookup":{"subject":"The Wizard of Oz","fact":"first shown in France"}}\n```');
  const result = await f.service.ask(f.dm.id, { ...request, prompt: 'When was "The Wizard of Oz" first shown in France?' });
  assert.equal(result.usedChat, false);
  assert.equal(result.needsChatConfirmation, undefined);
  assert.deepEqual(f.lookups, ['The Wizard of Oz first shown in France']);
  await f.service.ask(f.dm.id, { ...request, prompt: 'When was "The Wizard of Oz" first shown in Italy?' });
  assert.deepEqual(f.lookups, ['The Wizard of Oz first shown in France']);
});

test('an expired general continuation is reported without reusing client-supplied turns', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const f = fixture(t, () => '{"intent":"general"}');
  const first = await f.service.ask(f.dm.id, { ...request, prompt: 'What is the capital of Canada?' });
  assert.ok(first.continuationToken);
  t.mock.timers.tick(30 * 60_000);
  const callsBefore = f.calls.length;
  const result = await f.service.ask(f.dm.id, { ...request, prompt: 'Which province is it in?',
    generalContinuationToken: first.continuationToken, assistantTurns: [{ role: 'assistant', text: privateAnswer }],
  });
  assert.equal(result.generalContextExpired, true);
  assert.equal(result.usedChat, false);
  assert.notEqual(result.continuationToken, first.continuationToken);
  for (const { prompt } of f.calls.slice(callsBefore)) {
    assert.ok(!prompt.includes(privateAnswer));
    assert.ok(!prompt.includes('What is the capital of Canada?'));
  }
});

test('public lookup uses the remaining research time and skips a spent deadline', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const delays: number[] = [];
  t.mock.method(AbortSignal, 'timeout', (delay: number) => { delays.push(delay); return timeout(delay); });
  const f = fixture(t, question => {
    t.mock.timers.tick(question.includes('first shown') ? 80 : 100);
    return '{"intent":"general","publicLookup":{"subject":"The Wizard of Oz"}}';
  }, { researchMs: 100 });
  await f.service.ask(f.dm.id, { ...request, prompt: 'When was The Wizard of Oz first shown?' });
  assert.ok(delays.includes(20));
  assert.deepEqual(f.lookups, ['The Wizard of Oz']);
  await f.service.ask(f.dm.id, { ...request, prompt: 'Who starred in The Wizard of Oz?' });
  assert.deepEqual(f.lookups, ['The Wizard of Oz']);
  assert.ok(!delays.includes(40_000));
});
