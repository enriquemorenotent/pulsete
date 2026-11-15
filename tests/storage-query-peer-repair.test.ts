import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage, makeStorageFile, openSqliteDatabase } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';
import { upsertQueryPeerIdentity } from '../server/storage-query-identities.js';
import { repairSelfQueryPeerIdentities } from '../server/storage-query-peer-repair.js';
import { upsertBuffer } from '../server/storage-buffers.js';
import { storageMigrations } from '../server/storage-migration-list.js';
import { appendConversationMessage } from '../server/runtime-conversation-store.js';

const account = (value: string) => ({ kind: 'account' as const, value });

test('upgrade removes only proven self-only peer identities and recovers a split conversation', () => {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const original = storage.conversations.upsertQuery(network.id, 'peer', account('peer'));
  storage.conversations.setBufferNotes(original.id, 'original notes');
  for (const [id, self, identity] of [
    ['incoming', false, account('peer')], ['outgoing', true, account('me')],
  ] as const) {
    storage.conversations.appendMessage({
      id, networkId: network.id, target: 'peer', nick: self ? 'me' : 'peer',
      self, senderIdentity: identity, body: id, kind: 'line', ts: 1,
    }, original.id);
  }
  storage.close();
  const db = openSqliteDatabase(path);
  upsertQueryPeerIdentity(db, { bufferId: original.id, networkId: network.id,
    nick: 'peer', identity: account('me'), source: 'manual' });
  db.prepare('UPDATE buffers SET targetKey = NULL, isOpen = 0 WHERE id = ?').run(original.id);
  const duplicate = upsertBuffer(db, { networkId: network.id, target: 'peer', kind: 'query', notes: 'new notes' });
  upsertQueryPeerIdentity(db, { bufferId: duplicate.id, networkId: network.id,
    nick: 'peer', identity: account('peer'), source: 'manual' });
  db.exec('PRAGMA user_version = 38');
  db.close();

  const upgraded = new Storage(path);
  const result = upgraded.conversations.upsertQueryWithMergeResult(network.id, 'peer', account('peer'));
  assert.equal(result.buffer.id, original.id);
  assert.ok(result.buffer.notes?.includes('original notes'));
  assert.ok(result.buffer.notes?.includes('new notes'));
  assert.deepEqual(result.removedBufferIds, [duplicate.id]);
  assert.deepEqual(upgraded.conversations.listAllMessagesForBuffer(original.id).map(m => m.id), ['incoming', 'outgoing']);
  upgraded.close();
  const check = openSqliteDatabase(path);
  assert.deepEqual(check.prepare('SELECT identityValue FROM query_peer_identities WHERE bufferId = ?').all(original.id), [{ identityValue: 'peer' }]);
  assert.equal(repairSelfQueryPeerIdentities(check), 0);
  assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(), []);
  check.close();
});

test('cleanup preserves mixed and unproven identities, supports userhosts, and rolls back on failure', () => {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertQuery(network.id, 'peer');
  for (const [id, self, identity] of [
    ['self', true, account('mixed')], ['peer', false, account('mixed')],
    ['host', true, { kind: 'userhost', value: 'me@host.test' }],
  ] as const) storage.conversations.appendMessage({
    id, networkId: network.id, target: 'peer', nick: 'peer', self,
    senderIdentity: identity, body: id, kind: 'line', ts: 1,
  }, query.id);
  storage.close();
  const db = openSqliteDatabase(path);
  for (const identity of [account('mixed'), account('unproven'), { kind: 'userhost' as const, value: 'me@host.test' }]) {
    upsertQueryPeerIdentity(db, { bufferId: query.id, networkId: network.id,
      nick: 'peer', identity, source: 'manual' });
  }
  const migration = storageMigrations.find(m => m.version === 39)!;
  assert.throws(() => migration.apply({ ...db, exec(sql) {
    if (sql === 'COMMIT') throw new Error('Interrupted repair');
    db.exec(sql);
  } }, { existedBeforeOpen: true }), /Interrupted repair/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM query_peer_identities').get<{ n: number }>()?.n, 3);
  assert.equal(repairSelfQueryPeerIdentities(db), 1);
  assert.deepEqual(db.prepare('SELECT identityValue FROM query_peer_identities ORDER BY identityValue').all(),
    [{ identityValue: 'mixed' }, { identityValue: 'unproven' }]);
  db.close();
});

for (const runtime of [false, true]) test(`${runtime ? 'runtime' : 'storage'} routing respects effective self attribution before recording peer identities`, () => {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const unrelated = storage.conversations.upsertQuery(network.id, 'unrelated', account('me'));
  const message = { id: 'self', networkId: network.id, target: 'recipient', nick: 'me',
    senderIdentity: account('me'), body: 'hello', kind: 'line' as const, self: false, ts: 1,
    speakerRole: 'self' as const, attributionConfidence: 'high' as const };
  const saved = runtime ? appendConversationMessage(storage.conversations, { message }).saved
    : storage.conversations.appendMessage(message);
  assert.equal(saved.self, true);
  assert.notEqual(saved.bufferId, unrelated.id);
  assert.equal(storage.conversations.getBuffer(unrelated.id)?.target, 'unrelated');
  assert.equal(storage.conversations.getBuffer(saved.bufferId!)?.peerIdentity ?? null, null);
  storage.close();
});
