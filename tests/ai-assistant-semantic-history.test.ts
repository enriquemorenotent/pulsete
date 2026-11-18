import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAiAssistantContext } from '../server/ai-assistant-context.js';
import { assistantHistoryResearch } from '../server/ai-assistant-research.js';
import { assistantPassageIndexVersion, embeddingSize } from '../server/ai-assistant-embedding-version.js';
import { AssistantPassageStore } from '../server/storage-assistant-passages.js';
import { assistantPassageBucketMs } from '../server/storage-assistant-passages-schema.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { makeStorageFile, openSqliteDatabase, Storage } from './helpers/storage-test-helpers.js';

function fixture() {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const db = openSqliteDatabase(path);
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertBuffer({ networkId: network.id, target: '#test', kind: 'channel' });
  const history = new AssistantPassageStore(db);
  const append = (id: string, ts: number, body: string, target = buffer.target) => storage.conversations.appendMessage({
    id, networkId: network.id, target, nick: 'alice', kind: 'line', self: false, ts, body,
  });
  return { append, buffer, history, db, storage, path, close() { db.close(); storage.close(); } };
}

test('the persisted passage index overlaps bucket boundaries and invalidates imports, edits and deletes', () => {
  const f = fixture();
  const start = assistantPassageBucketMs;
  try {
    f.append('previous', start - 1, 'Nia takes the first slot.');
    f.append('latest', start, 'If she flakes, bump Rowan up.');
    // Messages from before the migration have no dirty bucket records yet.
    f.db.exec('DELETE FROM assistant_passage_buckets');
    f.history.initialize(assistantPassageIndexVersion);
    assert.equal(f.history.seed(), true);
    const indexNext = () => {
      const job = f.history.nextBucket(f.buffer.id)!;
      f.history.resetStage();
      const passages = [...f.history.passageBatches(job)].flat();
      assert.ok(f.history.saveBatch(job, 0, passages, passages.map(() => new Float32Array(embeddingSize))));
      f.history.finish(job);
      return { job, passages };
    };
    const visible = () => f.history.candidates(f.buffer.id, Number.MAX_SAFE_INTEGER, null, { bucket: -1, ordinal: -1 });
    indexNext();
    const indexed = indexNext();
    assert.deepEqual(indexed.passages.map(passage => passage.rows.map(row => row.id)), [['previous', 'latest']]);
    assert.equal(visible().length, 2);
    const reopenedDb = openSqliteDatabase(f.path);
    try {
      const reopened = new AssistantPassageStore(reopenedDb);
      reopened.initialize(assistantPassageIndexVersion);
      assert.equal(reopened.candidates(f.buffer.id, 2, null, { bucket: -1, ordinal: -1 }).length, 2);
    } finally { reopenedDb.close(); }
    assert.equal(f.history.candidates(f.buffer.id, 1, null, { bucket: -1, ordinal: -1 }).length, 1);

    // An out-of-order import changes the context of the following bucket.
    f.append('older-import', start - 2, 'Opening act planning.');
    assert.deepEqual(visible(), []);
    indexNext();
    const updated = indexNext();
    assert.deepEqual(updated.passages[0].rows.map(row => row.id), ['older-import', 'previous', 'latest']);

    f.db.prepare('UPDATE messages SET body = ? WHERE id = ?').run('If she flakes, bump Elia up.', 'latest');
    assert.equal(visible().length, 1);
    assert.equal(f.history.saveBatch(updated.job, 0, updated.passages, updated.passages.map(() => new Float32Array(embeddingSize))), false);
    assert.match(indexNext().passages[0].text, /Elia/);

    f.storage.conversations.deleteMessagesByIdPrefixes(['previous']);
    assert.deepEqual(visible(), []);
    indexNext();
    assert.deepEqual(indexNext().passages[0].rows.map(row => row.id), ['older-import', 'latest']);
    f.history.initialize('new-model');
    assert.deepEqual(visible(), []);
    assert.ok(f.history.nextBucket(f.buffer.id));
  } finally { f.close(); }
});

test('hybrid research hydrates only in-scope originals and preserves literal results', async () => {
  const f = fixture();
  try {
    f.append('outside', 1, 'An older event');
    f.append('literal', 2, 'opening act discussion');
    for (let index = 1; index <= 4; index++) f.append(`chatter-${index}`, index + 2, 'Unrelated chatter');
    f.append('meaning', 7, 'If she flakes, bump Rowan up.');
    f.append('other', 3, 'This must stay in the other channel', '#other');
    const context = buildAiAssistantContext(f.storage.conversations, f.buffer.id, { mode: 'answer', scope: 'recent', prompt: '' });
    const research = assistantHistoryResearch(f.storage.conversations, context, null, {
      question: 'Who fills in?',
      search: async input => {
        assert.equal(input.question, 'Who fills in?');
        assert.deepEqual(input.examples, ['in case they bail']);
        f.append('arrived-later', 3, 'Late arrival');
        return [['outside', 'literal', 'meaning', 'other', 'arrived-later']];
      },
    });
    const range = { start: 2, end: 8, label: 'chosen period' };
    const result = JSON.parse(await research.read({
      action: 'related', phrases: ['opening act'], offset: 0, examples: ['in case they bail'],
    }, range));
    assert.ok(result.messages.some(({ id }: { id: string }) => id === 'literal'));
    assert.equal(result.operation.examples, undefined);
    assert.doesNotMatch(JSON.stringify(result), /"id":"(?:other|outside|arrived-later)"/);
    assert.ok(result.relatedPassages.some(({ newMessages }: { newMessages: { id: string }[] }) =>
      newMessages.some(({ id }) => id === 'meaning')));
    const labels = [...result.messages.map(({ source }: { source: string }) => source),
      ...result.relatedPassages.flatMap(({ newMessages }: { newMessages: { source: string }[] }) => newMessages.map(({ source }) => source))];
    research.finish(false);
    assert.ok(context.sources?.some(source => source.message.id === 'meaning' && labels.includes(source.label)));
    const literal = JSON.parse(await research.read({ action: 'search', query: 'opening act', offset: 0 }, range));
    assert.deepEqual(literal.messages.map(({ id }: { id: string }) => id), ['literal']);
    assert.equal(literal.relatedPassages, undefined);
  } finally { f.close(); }
});
