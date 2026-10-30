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
function fixture(run: (input: Parameters<CodexAssistantProvider['request']>[0]) => Promise<string>, options = {}) {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertBuffer({ networkId: network.id, target: '#test', kind: 'channel' });
  for (const [id, day, body] of [['old', 1, 'Reunion: Cedar Hall. Organizer Maya.'], ['new', 3, 'Reunion moved to Willow Studio. Organizer Omar.']] as const)
    storage.conversations.appendMessage({ id, networkId: network.id, target: '#test', nick: 'alice', body,
      kind: 'line', self: false, ts: new Date(2026, 0, day, 12).getTime() });
  const provider: CodexAssistantProvider = { model: null, status: async () => status,
    startLogin: async () => ({ instructions: null, status }), request: async (input) => ({ answer: await run(input), status }) };
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
