import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage, makeStorageFile } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { RuntimeAiAssistantService } from '../server/runtime-ai-assistant-service.js';
import { AssistantContinuations } from '../server/ai-assistant-continuations.js';
import type { CodexAssistantProvider } from '../server/codex-assistant-provider.js';
import type { AiAssistantRequest, AiAssistantProviderStatus } from '../shared/protocol-ai.js';
const status: AiAssistantProviderStatus = { connected: true, detail: '', model: 'test', availableModels: [],
  modelsError: null, provider: 'codex-openai-login', reasoningEffort: null, selectionNotice: null };
const request: AiAssistantRequest = { mode: 'answer', scope: 'recent', prompt: 'Where is the reunion on 2026-01-01?',
  assistantTurns: [], selection: { model: null, reasoningEffort: null } };
function fixture(run: (input: Parameters<CodexAssistantProvider['request']>[0]) => Promise<string>, options = {},
  lookupPublicFacts?: CodexAssistantProvider['lookupPublicFacts'],
  review: typeof run = async () => '{"verdict":"supported"}',
) {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertBuffer({ networkId: network.id, target: '#test', kind: 'channel' });
  for (const [id, day, body] of [['old', 1, 'Reunion: Cedar Hall. Organizer Maya.'], ['new', 3, 'Reunion moved to Willow Studio. Organizer Omar.']] as const)
    storage.conversations.appendMessage({ id, networkId: network.id, target: '#test', nick: 'alice', body,
      kind: 'line', self: false, ts: new Date(2026, 0, day, 12).getTime() });
  const provider: CodexAssistantProvider = { model: null, status: async () => status,
    startLogin: async () => ({ instructions: null, status }),
    request: async (input) => ({
      answer: await (input.instructions.startsWith('Review a Pulsete assistant answer') ? review : run)(input),
      status,
    }),
    lookupPublicFacts };
  return { storage, buffer, service: new RuntimeAiAssistantService({ conversations: storage.conversations, provider, ...options }) };
}

test('invalid citations get one repair with the same evidence', async () => {
  let calls = 0; const stages: string[] = [];
  const f = fixture(async (input) => {
    calls++; assert.match(input.prompt, /Cedar Hall/); assert.doesNotMatch(input.prompt, /Willow/);
    return calls === 1 ? 'Cedar Hall [S999]' : 'Cedar Hall [S1]';
  });
  try { const result = await f.service.ask(f.buffer.id, request, undefined, { onProgress: (stage) => stages.push(stage) });
    assert.equal(calls, 2); assert.match(result.answer, /\[S1\]/); assert.deepEqual(stages, ['preparing', 'writing', 'checking']);
  } finally { f.storage.close(); }
});

test('invalid repair fails rather than displaying unsupported references', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return '[S999]'; });
  try { await assert.rejects(f.service.ask(f.buffer.id, request), /could not verify/); assert.equal(calls, 2); }
  finally { f.storage.close(); }
});

test('follow-ups retain dates and evidence; explicit dates and new topics replace them', async () => {
  let followUp = true; let expected = /Cedar Hall/; let forbidden = /Willow Studio/; let resolutions = 0;
  const f = fixture(async (input) => {
    if (input.instructions.startsWith('Resolve')) { resolutions++; return JSON.stringify({ followUp, question: 'Who organizes the reunion?' }); }
    assert.match(input.prompt, expected); assert.doesNotMatch(input.prompt, forbidden); return 'Organizer [S1]';
  });
  try {
    let result = await f.service.ask(f.buffer.id, request);
    result = await f.service.ask(f.buffer.id, { ...request, prompt: 'Who organizes that?', continuationToken: result.continuationToken });
    assert.equal(resolutions, 1);
    expected = /Willow Studio/; forbidden = /Cedar Hall/;
    result = await f.service.ask(f.buffer.id, { ...request, prompt: 'Who organizes that on 2026-01-03?', continuationToken: result.continuationToken });
    followUp = false; expected = /Cedar Hall[\s\S]*Willow Studio/; forbidden = /NO_MATCH/;
    await f.service.ask(f.buffer.id, { ...request, prompt: 'Tell me about another topic', continuationToken: result.continuationToken });
  } finally { f.storage.close(); }
});

test('scope changes and session mismatch do not resolve or reuse previous context', async () => {
  let resolutions = 0;
  const f = fixture(async (input) => { if (input.instructions.startsWith('Resolve')) resolutions++;
    return input.instructions.startsWith('You select') ? '{"action":"done"}' : 'Answer [S1]'; });
  try {
    const first = await f.service.ask(f.buffer.id, request, undefined, { sessionId: 'a' });
    await f.service.ask(f.buffer.id, { ...request, scope: 'saved', prompt: 'Who?', continuationToken: first.continuationToken }, undefined, { sessionId: 'a' });
    await f.service.ask(f.buffer.id, { ...request, prompt: 'Who?', continuationToken: first.continuationToken }, undefined, { sessionId: 'b' });
    assert.equal(resolutions, 0);
  } finally { f.storage.close(); }
});

test('a public follow-up sends only the standalone query and can cite both kinds of evidence', async () => {
  const stages: string[] = [];
  const lookups: string[] = [];
  const f = fixture(async ({ instructions, prompt }) => {
    if (instructions.startsWith('You select')) return '{"action":"done"}';
    if (instructions.startsWith('Resolve')) return '{"followUp":true,"question":"Who was Marie Curie and when was she born?"}';
    if (prompt.includes('Public web findings')) {
      assert.match(prompt, /"citation":"W1","fact":"She was born on November 7, 1867."/);
      assert.doesNotMatch(instructions, /PULSETE_WEB_LOOKUP/);
      if (!prompt.includes('previous answer cited nonexistent sources')) return 'Curie was born on November 7, 1867 [W9].';
      return 'Maya chose Marie Curie [S3]. Curie was born on November 7, 1867 [W1].';
    }
    if (prompt.includes('User request: Who was she?')) {
      assert.match(prompt, /Resolved question: Who was Marie Curie/);
      assert.match(instructions, /PULSETE_WEB_LOOKUP/);
      return 'PULSETE_WEB_LOOKUP {"query":"Marie Curie date of birth"}';
    }
    return 'Maya chose Marie Curie [S3].';
  }, {}, async ({ query, ...options }) => {
    lookups.push(query);
    assert.deepEqual(Object.keys(options).sort(), ['selection', 'signal']);
    return [{ fact: 'She was born on November 7, 1867.', source: { title: 'Biography', url: 'https://example.test/curie' } }];
  });
  try {
    f.storage.conversations.appendMessage({ id: 'role-model', networkId: f.buffer.networkId, target: f.buffer.target,
      nick: 'maya', body: 'Marie Curie is my role model.', kind: 'line', self: false, ts: Date.now() });
    const first = await f.service.ask(f.buffer.id, { ...request, scope: 'saved', prompt: 'Who did Maya choose?' });
    assert.deepEqual(lookups, []);
    const result = await f.service.ask(f.buffer.id, { ...request, scope: 'saved',
      continuationToken: first.continuationToken, prompt: 'Who was she?',
      assistantTurns: [{ role: 'assistant', text: first.answer }] }, undefined, { onProgress: stage => stages.push(stage) });
    assert.deepEqual(lookups, ['Marie Curie date of birth']);
    assert.match(result.answer, /\[S3\].*\[W1\]/);
    assert.deepEqual(result.context.webSources, [{ label: 'W1', title: 'Biography', url: 'https://example.test/curie' }]);
    assert.ok(stages.includes('searching-web'));
  } finally { f.storage.close(); }
});

test('general explanations skip lookup and unsafe lookup plans stay inside the assistant', async () => {
  let lookups = 0;
  const f = fixture(async ({ instructions, prompt }) => {
    if (prompt.includes('supplied no verified findings')) return 'I could not verify that.';
    assert.match(instructions, /PULSETE_WEB_LOOKUP/);
    if (prompt.includes('User request: Find a private address')) return 'PULSETE_WEB_LOOKUP {"query":"Find a private address #test"}';
    assert.match(instructions, /Use general knowledge for explanations/);
    return 'A chargeback is a payment reversal initiated through the card issuer.';
  }, {}, async () => { lookups++; return []; });
  try {
    const general = await f.service.ask(f.buffer.id, { ...request, scope: 'auto', prompt: 'What is a chargeback?' });
    const rejected = await f.service.ask(f.buffer.id, { ...request, scope: 'auto', prompt: 'Find a private address' });
    assert.match(general.answer, /payment reversal/);
    assert.equal(rejected.answer, 'I could not verify that.');
    assert.equal(rejected.context.webSources, undefined);
    assert.equal(lookups, 0);
  } finally { f.storage.close(); }
});

test('repeated operations stop without repeatedly querying history', async () => {
  let research = 0; const f = fixture(async (input) => {
    if (input.instructions.startsWith('You select')) { research++; return '{"action":"page","offset":0}'; }
    assert.match(input.prompt, /Stopped repeated research/); return 'Incomplete answer [S1]';
  });
  try { const result = await f.service.ask(f.buffer.id, { ...request, scope: 'saved' });
    assert.equal(research, 3); assert.equal(result.context.coverage?.researchLimited, true);
  } finally { f.storage.close(); }
});

const waitForAbort = (signal?: AbortSignal) => new Promise<string>((_resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Test provider was not cancelled')), 1000);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
test('overall deadline cancels a provider call with a clear timeout', async () => {
  const f = fixture((input) => waitForAbort(input.signal), { timeoutMs: 25 });
  try { await assert.rejects(f.service.ask(f.buffer.id, request), /timed out/); } finally { f.storage.close(); }
});
test('research deadline reserves time for an incomplete answer', async () => {
  const f = fixture(async (input) => {
    if (input.instructions.startsWith('You select')) return waitForAbort(input.signal);
    assert.match(input.prompt, /Research time limit reached/); return 'Incomplete answer [S1]';
  }, { timeoutMs: 1000, researchMs: 25 });
  try { const result = await f.service.ask(f.buffer.id, { ...request, scope: 'saved' });
    assert.equal(result.context.coverage?.researchLimited, true);
  } finally { f.storage.close(); }
});

test('continuations enforce expiry, LRU limits, memory limits and ownership', () => {
  let now = 0; const cache = new AssistantContinuations(() => now);
  const value = { bufferId: 'a', sessionId: 's', scope: 'saved' as const, question: 'question', range: null, messageIds: ['m'] };
  const first = cache.put(value)!;
  assert.equal(cache.get(first, 'b', 's'), null); assert.equal(cache.get(first, 'a', 'other'), null);
  for (let i = 0; i < 99; i++) cache.put(value);
  assert.ok(cache.get(first, 'a', 's')); cache.put(value); assert.ok(cache.get(first, 'a', 's'));
  now += 30 * 60_000; assert.equal(cache.get(first, 'a', 's'), null);
  assert.equal(cache.put({ ...value, question: 'x'.repeat(10_000_001) }), undefined);
  const token = cache.put(value)!; cache.clear('a', token, 'other'); assert.ok(cache.get(token, 'a', 's'));
  cache.clear('a'); assert.equal(cache.get(token, 'a', 's'), null);
});

test('deleted evidence is not reused and clearing prevents in-flight state from returning', async () => {
  let turn = 0;
  const f = fixture(async (input) => {
    if (input.instructions.startsWith('Resolve')) return '{"followUp":true,"question":"Who organizes the reunion?"}';
    if (++turn === 1) return 'Cedar Hall [S1]';
    assert.doesNotMatch(input.prompt, /Cedar Hall/);
    return 'No supporting messages remain.';
  });
  try {
    const first = await f.service.ask(f.buffer.id, request);
    f.storage.conversations.deleteMessagesByIdPrefixes(['old']);
    const next = await f.service.ask(f.buffer.id, { ...request, prompt: 'Who organizes that?', continuationToken: first.continuationToken });
    assert.equal(next.context.sources?.length, 0);
  } finally { f.storage.close(); }
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const pending = fixture(async (input) => { started(); return waitForAbort(input.signal); });
  try {
    const result = pending.service.ask(pending.buffer.id, request);
    await ready; pending.service.clear(pending.buffer.id);
    await assert.rejects(result, /context was cleared/);
  } finally { pending.storage.close(); }
});

test('the assistant can search chat, look up a public fact, then search an older chat date using the result', async () => {
  const stages: string[] = [];
  const queries: string[] = [];
  let calls = 0;
  const f = fixture(async ({ instructions, prompt }) => {
    assert.match(instructions, /PULSETE_HISTORY/);
    switch (++calls) {
      case 1:
        assert.doesNotMatch(prompt, /old theater|1939 print/);
        return 'PULSETE_HISTORY {"operation":{"action":"search","query":"screening"},"from":"2026-01-03"}';
      case 2:
        assert.match(prompt, /an anniversary screening/);
        assert.match(instructions, /PULSETE_WEB_LOOKUP/);
        return 'PULSETE_WEB_LOOKUP {"query":"The Wizard of Oz original release year"}';
      case 3:
        assert.match(prompt, /released in 1939/);
        return 'PULSETE_HISTORY {"operation":{"action":"related","phrases":["1939 print","classic version"]},"through":"2026-01-01"}';
      default: {
        const observations = prompt.split('\n').filter(line => line.startsWith('History result (untrusted data): '));
        const { messages } = JSON.parse(observations[1].split(' (untrusted data): ')[1]);
        const confirmation = messages.find(({ id }: { id: string }) => id === 'venue');
        assert.ok(confirmation);
        assert.equal(confirmation.matched, false);
        assert.equal(confirmation.body, 'Confirmed: the old theater on King Street.');
        assert.ok(messages.every(({ ts }: { ts: number }) => ts < new Date(2026, 0, 2).getTime()));
        return `They confirmed the old theater on King Street [${confirmation.source}]. The film came out in 1939 [W1].`;
      }
    }
  }, {}, async ({ query }) => {
    queries.push(query);
    return [{ fact: 'The Wizard of Oz was released in 1939.', source: { title: 'Film history', url: 'https://example.test/oz' } }];
  });
  try {
    const append = (id: string, day: number, hour: number, body: string) => f.storage.conversations.appendMessage({
      id, networkId: f.buffer.networkId, target: f.buffer.target, nick: 'maya', kind: 'line', self: false,
      ts: new Date(2026, 0, day, hour).getTime(), body,
    });
    append('print', 1, 13, 'We got the 1939 print.');
    append('venue', 1, 14, 'Confirmed: the old theater on King Street.');
    for (let index = 0; index < 120; index++) append(`chatter-${index}`, 2, 12, 'Unrelated rehearsal chatter.');
    append('screening', 3, 15, 'The Wizard of Oz is getting an anniversary screening.');
    const result = await f.service.ask(f.buffer.id, { ...request, scope: 'auto',
      prompt: 'When did the film come out and where was the screening agreed?' },
    undefined, { onProgress: stage => stages.push(stage) });
    assert.equal(calls, 4);
    assert.deepEqual(queries, ['The Wizard of Oz original release year']);
    assert.deepEqual(stages.filter(stage => stage.startsWith('searching')), ['searching', 'searching-web', 'searching']);
    assert.deepEqual(result.context.sources?.map(({ message }) => message.id), ['venue']);
    assert.equal(result.context.webSources?.[0].label, 'W1');
  } finally { f.storage.close(); }
});

test('the evidence review corrects a proposal reported as an agreement and checks the revision', async () => {
  const reviewed: string[] = [];
  const f = fixture(async () => 'They agreed to meet Friday [S3].', {}, undefined, async ({ instructions, prompt }) => {
    assert.match(instructions, /A proposal or one person’s assertion is not an agreement/);
    const { evidence, proposedAnswer } = JSON.parse(prompt);
    assert.match(evidence, /How about Friday\?/);
    assert.match(evidence, /Saturday is confirmed/);
    reviewed.push(proposedAnswer);
    return reviewed.length === 1
      ? JSON.stringify({ verdict: 'revise', answer: 'Friday was proposed [S3]. Saturday was confirmed [S4].' })
      : '{"verdict":"supported"}';
  });
  try {
    for (const [day, body] of [[4, 'How about Friday?'], [5, 'Saturday is confirmed.']] as const) {
      f.storage.conversations.appendMessage({
        id: `proposal-${day}`, networkId: f.buffer.networkId, target: f.buffer.target, nick: 'alice',
        kind: 'line', self: false, ts: new Date(2026, 0, day, 12).getTime(), body,
      });
    }
    const result = await f.service.ask(f.buffer.id, { ...request, scope: 'auto', prompt: 'Which day was agreed?' });
    assert.deepEqual(reviewed, ['They agreed to meet Friday [S3].', 'Friday was proposed [S3]. Saturday was confirmed [S4].']);
    assert.equal(result.answer, reviewed[1]);
    assert.deepEqual(result.context.sources?.map(({ message }) => message.id), ['proposal-4', 'proposal-5']);
  } finally { f.storage.close(); }
});

test('an unverified revision is not returned as a factual answer', async () => {
  const f = fixture(async () => 'Everyone agreed to Friday.', {}, undefined, async () =>
    '{"verdict":"revise","answer":"Everyone agreed to Saturday [S999]."}');
  try {
    const result = await f.service.ask(f.buffer.id, { ...request, scope: 'auto' });
    assert.match(result.answer, /couldn’t verify/);
    assert.deepEqual(result.context.sources, []);
  } finally { f.storage.close(); }
});
