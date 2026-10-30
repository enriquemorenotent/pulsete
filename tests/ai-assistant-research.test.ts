import assert from 'node:assert/strict';
import test from 'node:test';
import { makeStorageFile, Storage } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { RuntimeAiAssistantService } from '../server/runtime-ai-assistant-service.js';
import type { AiAssistantProviderStatus, AiAssistantRequest } from '../shared/protocol-ai.js';
import type { CodexAssistantProvider } from '../server/codex-assistant-provider.js';

const status: AiAssistantProviderStatus = { connected: true, detail: 'test', model: null,
  availableModels: [], modelsError: null, provider: 'codex-openai-login', reasoningEffort: null, selectionNotice: null };
const request: AiAssistantRequest = { scope: 'saved', mode: 'answer', prompt: 'Where is the reunion?',
  assistantTurns: [], selection: { model: null, reasoningEffort: null } };
function fixture() {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertBuffer({ kind: 'channel', networkId: network.id, target: '#test' });
  for (let index = 0; index < 650; index++) storage.conversations.appendMessage({ id: `research-${index}`,
    networkId: network.id, target: '#test', nick: 'alice', kind: 'line', self: false, ts: index + 1,
    body: index === 0 ? 'orchard venue agreed' : 'ordinary conversation' });
  storage.conversations.appendMessage({ id: 'private-other', networkId: network.id, target: '#other',
    nick: 'alice', kind: 'line', self: false, ts: 1, body: 'orchard secret in other conversation' });
  return { storage, buffer, network };
}
function provider(run: (input: Parameters<CodexAssistantProvider['request']>[0]) => Promise<string>): CodexAssistantProvider {
  return { model: null, status: async () => status, startLogin: async () => ({ instructions: null, status }),
    request: async (input) => ({ answer: await run(input), status }) };
}

test('saved assistant finds evidence older than the initial 600 messages and cites it in the final answer', async () => {
  const { storage, buffer } = fixture();
  try {
    let calls = 0;
    const service = new RuntimeAiAssistantService({ conversations: storage.conversations, provider: provider(async (input) => {
      calls++;
      assert.doesNotMatch(input.prompt, /secret in other conversation/);
      if (calls === 1) {
        assert.doesNotMatch(input.prompt, /orchard venue agreed/);
        return JSON.stringify({ action: 'search', query: 'orchard' });
      }
      assert.match(input.prompt, /orchard venue agreed/);
      if (calls === 2) return '{"action":"count","query":"orchard"}';
      if (calls === 3) { assert.match(input.prompt, /"total":1/); return '{"action":"done"}'; }
      assert.match(input.prompt, /Counts are exact only/);
      return 'The orchard was agreed.';
    }) });
    const result = await service.ask(buffer.id, request);
    assert.equal(calls, 4);
    assert.equal(result.context.coverage?.totalMessages, 650);
    assert.equal(result.context.coverage?.researchLimited, false);
    assert.ok(result.context.sources?.some((source) => source.message.id === 'research-0'));
    assert.equal(new Set(result.context.sources?.map((source) => source.label)).size, result.context.sources?.length);
  } finally { storage.close(); }
});

test('history operations page all matches, isolate reads, enforce date range and exclude later arrivals', () => {
  const { storage, buffer, network } = fixture();
  try {
    const store = storage.conversations;
    const range = { start: 1, end: 101, label: 'test' };
    const all = store.assistantHistorySnapshot(buffer.id, null);
    assert.equal(store.queryAssistantHistory(buffer.id, all.maxRowid, null,
      { action: 'count', query: 'ordinary' }).total, 649);
    const snapshot = store.assistantHistorySnapshot(buffer.id, range);
    assert.equal(snapshot.total, 100);
    storage.conversations.appendMessage({ id: 'later-arrival', networkId: network.id, target: '#test',
      nick: 'alice', kind: 'line', self: false, ts: 5, body: 'ordinary conversation' });
    const first = store.queryAssistantHistory(buffer.id, snapshot.maxRowid, range, { action: 'search', query: 'ordinary', offset: 0 });
    assert.equal(first.total, 99);
    assert.equal(first.nextOffset, 20);
    const next = store.queryAssistantHistory(buffer.id, snapshot.maxRowid, range, { action: 'search', query: 'ordinary', offset: 20 });
    assert.equal(next.messages[0].id, 'research-21');
    assert.equal(first.messages[0].historyOffset, 1);
    assert.equal(store.queryAssistantHistory(buffer.id, snapshot.maxRowid, range, { action: 'read', messageId: 'private-other', offset: 0 }).messages.length, 0);
    assert.equal(store.queryAssistantHistory(buffer.id, snapshot.maxRowid, range, { action: 'count', query: '%' }).total, 0);
    assert.equal(store.queryAssistantHistory(buffer.id, snapshot.maxRowid, range, { action: 'count', query: '' }).total, 100);
  } finally { storage.close(); }
});

test('long message chunks remain readable beyond the original body limit', () => {
  const { storage, buffer, network } = fixture();
  try {
    storage.conversations.appendMessage({ id: 'long-research', networkId: network.id, target: '#test',
      nick: 'alice', kind: 'line', self: false, ts: 700, body: 'x'.repeat(4500) + ' final agreement' });
    const snapshot = storage.conversations.assistantHistorySnapshot(buffer.id, null);
    const query = (offset: number) => storage.conversations.queryAssistantHistory(buffer.id, snapshot.maxRowid, null,
      { action: 'read', messageId: 'long-research', offset });
    assert.equal(query(0).messages[0].nextBodyOffset, 2000);
    assert.equal(query(4000).messages[0].nextBodyOffset, null);
    assert.match(query(4000).messages[0].body, /final agreement/);
  } finally { storage.close(); }
});

test('malformed model operations are bounded and reported without executing arbitrary actions', async () => {
  const { storage, buffer } = fixture();
  try {
    let calls = 0;
    const service = new RuntimeAiAssistantService({ conversations: storage.conversations,
      provider: provider(async () => ++calls <= 8 ? '{"action":"shell","command":"bad"}' : 'Limited answer') });
    const result = await service.ask(buffer.id, request);
    assert.equal(calls, 9);
    assert.equal(result.context.coverage?.researchLimited, true);
  } finally { storage.close(); }
});

test('cancelling history research stops further model requests', async () => {
  const { storage, buffer } = fixture();
  try {
    const abort = new AbortController();
    let calls = 0;
    const service = new RuntimeAiAssistantService({ conversations: storage.conversations,
      provider: provider(async () => { calls++; abort.abort(); return '{"action":"done"}'; }) });
    await assert.rejects(service.ask(buffer.id, request, abort.signal), /abort/i);
    assert.equal(calls, 1);
  } finally { storage.close(); }
});

test('saved history research includes the final day of a requested date range', async () => {
  const { storage, buffer, network } = fixture();
  try {
    for (const day of [1, 7, 8]) storage.conversations.appendMessage({
      id: `date-range-${day}`, networkId: network.id, target: '#test', nick: 'alice',
      kind: 'line', self: false, ts: new Date(2026, 9, day, 12).getTime(), body: `Meeting on day ${day}`,
    });
    let calls = 0;
    const service = new RuntimeAiAssistantService({ conversations: storage.conversations,
      provider: provider(async (input) => {
        assert.doesNotMatch(input.prompt, /Meeting on day 8/);
        if (++calls === 1) return '{"action":"page","offset":0}';
        assert.match(input.prompt, /Meeting on day 1/);
        assert.match(input.prompt, /Meeting on day 7/);
        return calls === 2 ? '{"action":"done"}' : 'Both days were inspected.';
      }) });
    const result = await service.ask(buffer.id, { ...request, prompt: 'Summarize 2026-10-01 through 2026-10-07' });
    assert.equal(result.context.coverage?.totalMessages, 2);
    assert.deepEqual(result.context.sources?.map((source) => source.message.id), ['date-range-1', 'date-range-7']);
  } finally { storage.close(); }
});
