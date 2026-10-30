import assert from 'node:assert/strict';
import test from 'node:test';
import { makeStorageFile, Storage } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { buildAiAssistantContext, renderAiAssistantContext } from '../server/ai-assistant-context.js';

test('assistant history is bounded, date-scoped and isolated to the selected buffer', () => {
  const storage = new Storage(makeStorageFile());
  try {
    const network = storage.networks.upsert(createNetworkInput());
    const buffer = storage.conversations.upsertBuffer({ kind: 'channel', networkId: network.id, target: '#test' });
    for (let index = 0; index < 650; index++) {
      storage.conversations.appendMessage({ id: `m-${index}`, networkId: network.id,
        target: '#test', nick: 'alice', body: '😀'.repeat(1_000), kind: 'line', self: false,
        ts: new Date(2026, 5, 12).getTime() + index });
    }
    storage.conversations.appendMessage({ id: 'other', networkId: network.id,
      target: '#other', nick: 'bob', body: 'not selected', kind: 'line', self: false,
      ts: new Date(2026, 5, 12).getTime() });
    storage.conversations.appendMessage({ id: 'outside', networkId: network.id,
      target: '#test', nick: 'alice', body: 'outside day', kind: 'line', self: false,
      ts: new Date(2026, 5, 13).getTime() });
    const context = buildAiAssistantContext(storage.conversations, buffer.id, {
      mode: 'answer', prompt: 'Summarize June 12 2026', assistantTurns: [],
    });
    assert.equal(context.coverage?.truncated, true);
    const rendered = renderAiAssistantContext(context);
    assert.ok(Buffer.byteLength(rendered) < 34_000);
    assert.match(rendered, /INCOMPLETE/);
    assert.doesNotMatch(rendered, /outside day|not selected/);
    assert.ok(context.sources?.every((source) => source.message.bufferId === buffer.id));
    assert.ok(context.sources?.every((source) => !source.message.body.includes('�')));
    const page = storage.conversations.listAssistantHistory(buffer.id, 2);
    assert.equal(page.messages.length, 2);
    assert.equal(page.hasMore, true);
  } finally { storage.close(); }
});

test('open date bounds apply to context, history, research and counts at midnight', async () => {
  const { readAssistantDateRange } = await import('../server/ai-assistant-dates.js');
  const storage = new Storage(makeStorageFile());
  try {
    const network = storage.networks.upsert(createNetworkInput());
    const buffer = storage.conversations.upsertBuffer({ kind: 'channel', networkId: network.id, target: '#bounds' });
    const start = new Date(2026, 0, 3).getTime();
    const end = new Date(2026, 0, 4).getTime();
    for (const [id, ts] of [['earlier', start - 1], ['start', start], ['last', end - 1], ['later', end]] as const) {
      storage.conversations.appendMessage({ id, ts, networkId: network.id, target: buffer.target,
        nick: 'alice', body: `Venue ${id}`, kind: 'line', self: false });
    }
    for (const [direction, expected] of [['before', 'earlier'], ['after', 'later']] as const) {
      const prompt = `What venue ${direction} 2026-01-03?`;
      const range = readAssistantDateRange(prompt);
      const context = buildAiAssistantContext(storage.conversations, buffer.id, { mode: 'answer', scope: 'saved', prompt });
      assert.deepEqual(context.sources?.map((source) => source.message.id), [expected]);
      assert.match(renderAiAssistantContext(context), new RegExp(`${direction} 2026-01-03`));
      assert.deepEqual(storage.conversations.listAssistantHistory(buffer.id, 20, range).messages.map((m) => m.id), [expected]);
      const snapshot = storage.conversations.assistantHistorySnapshot(buffer.id, range);
      assert.equal(snapshot.total, 1);
      for (const action of [
        { action: 'page', offset: 0, order: 'oldest' },
        { action: 'search', query: 'Venue', offset: 0 },
        { action: 'read', messageId: expected, offset: 0 },
      ] as const) {
        assert.deepEqual(storage.conversations.queryAssistantHistory(buffer.id, snapshot.maxRowid, range, action)
          .messages.map((m) => m.id), [expected]);
      }
      assert.equal(storage.conversations.queryAssistantHistory(buffer.id, snapshot.maxRowid, range,
        { action: 'count', query: '' }).total, 1);
      assert.equal(storage.conversations.queryAssistantHistory(buffer.id, snapshot.maxRowid, range,
        { action: 'read', messageId: 'start', offset: 0 }).messages.length, 0);
    }
  } finally { storage.close(); }
});
