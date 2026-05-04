import assert from 'node:assert/strict';
import test from 'node:test';
import { makeStorageFile, openSqliteDatabase, Storage } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

test('query nick alias migration repairs empty duplicate buffers without rewriting logs', () => {
  const file = makeStorageFile();
  const storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput({ name: 'Cuff-Link (coco)', nick: 'coco' }));
  const rustAfk = storage.conversations.upsertQuery(network.id, 'Rust-AFK');
  storage.conversations.appendMessage({
    id: 'rust-before-change',
    networkId: network.id,
    target: 'Rust-AFK',
    nick: 'Rust',
    body: 'Music time',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'rust-change',
    networkId: network.id,
    target: 'Rust-AFK',
    nick: null,
    body: 'Rust is now known as Rust-AFK',
    kind: 'system',
    self: false,
    ts: 2,
  });
  const emptyRust = storage.conversations.upsertQuery(network.id, 'Rust');
  storage.close();

  const legacy = openSqliteDatabase(file);
  legacy.exec('DROP TABLE query_nick_aliases');
  legacy.exec('PRAGMA user_version = 15');
  legacy.close();

  const migrated = new Storage(file);
  const db = openSqliteDatabase(file);
  const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const duplicate = db.prepare('SELECT id FROM buffers WHERE id = ?').get(emptyRust.id);
  const aliases = (db.prepare(`
    SELECT nick
    FROM query_nick_aliases
    WHERE bufferId = ?
    ORDER BY nick COLLATE NOCASE ASC
  `).all(rustAfk.id) as Array<{ nick: string }>).map((row) => row.nick);
  db.close();

  const reopened = migrated.conversations.upsertQuery(network.id, 'Rust');
  const bodies = migrated.conversations.listMessages(network.id, 'Rust', 10).map((message) => message.body);
  migrated.close();

  assert.equal(version.user_version, 25);
  assert.equal(duplicate, undefined);
  assert.deepEqual(aliases, ['Rust', 'Rust-AFK']);
  assert.equal(reopened.id, rustAfk.id);
  assert.deepEqual(bodies, ['Music time', 'Rust is now known as Rust-AFK']);
});
