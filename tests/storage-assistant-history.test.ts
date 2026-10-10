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
