import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { currentStorageSchemaVersion } from '../server/storage-migrations.js';
import { makeStorageFile, openSqliteDatabase, Storage } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

test('message pins persist locally and list in original message order', () => {
  const file = makeStorageFile();
  const storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput({ workspaceOpen: true }));
  const buffer = storage.conversations.upsertQuery(network.id, 'Alice');
  const first = appendQueryMessage(storage, network.id, 'pin-first', 10, false);
  const second = appendQueryMessage(storage, network.id, 'pin-second', 20, true);

  assert.equal(storage.conversations.setMessagePinned(second.id, true, 100)?.pinnedAt, 100);
  assert.equal(storage.conversations.setMessagePinned(first.id, true, 200)?.pinnedAt, 200);
  assert.equal(storage.conversations.setMessagePinned(second.id, true, 300)?.pinnedAt, 100);
  assert.deepEqual(
    storage.conversations.listPinnedMessages(buffer.id).map((message) => message.id),
    [first.id, second.id],
  );
  storage.close();

  const reopened = new Storage(file);
  assert.deepEqual(
    reopened.conversations.listPinnedMessages(buffer.id).map((message) => ({
      id: message.id,
      pinnedAt: message.pinnedAt,
    })),
    [
      { id: first.id, pinnedAt: 200 },
      { id: second.id, pinnedAt: 100 },
    ],
  );
  reopened.conversations.setMessagePinned(first.id, false);
  assert.deepEqual(
    reopened.conversations.listPinnedMessages(buffer.id).map((message) => message.id),
    [second.id],
  );
  reopened.close();
});

test('target-centered message windows report only history outside the returned window', () => {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  storage.conversations.upsertQuery(network.id, 'Alice');
  const messages = Array.from({ length: 5 }, (_, index) =>
    appendQueryMessage(storage, network.id, `window-${index}`, index, index % 2 === 0));

  const centered = storage.conversations.getMessageWindowPage(messages[2]!.id, 1, 1);
  assert.deepEqual(centered?.messages.map((message) => message.id), [
    messages[1]!.id,
    messages[2]!.id,
    messages[3]!.id,
  ]);
  assert.equal(centered?.hasMore, true);
  assert.equal(centered?.hasNewer, true);

  const complete = storage.conversations.getMessageWindowPage(messages[2]!.id, 10, 10);
  assert.deepEqual(complete?.messages.map((message) => message.id), messages.map((message) => message.id));
  assert.equal(complete?.hasMore, false);
  assert.equal(complete?.hasNewer, false);
  storage.close();
});

test('clearing a PM transcript removes its pins', () => {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertQuery(network.id, 'Alice');
  const message = appendQueryMessage(storage, network.id, 'clear-pin', 1, false);
  storage.conversations.setMessagePinned(message.id, true, 100);

  storage.conversations.deleteMessages(network.id, 'Alice');

  assert.deepEqual(storage.conversations.listPinnedMessages(buffer.id), []);
  storage.close();
});

test('database backups include message pin metadata', () => {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  storage.conversations.upsertQuery(network.id, 'Alice');
  const message = appendQueryMessage(storage, network.id, 'backup-pin', 1, false);
  storage.conversations.setMessagePinned(message.id, true, 777);

  const backup = storage.exportBackup({});
  const envelope = JSON.parse(gunzipSync(backup.content).toString('utf8')) as {
    database: string;
  };
  const backupFile = join(mkdtempSync(join(tmpdir(), 'pulsete-pin-backup-')), 'backup.sqlite');
  writeFileSync(backupFile, Buffer.from(envelope.database, 'base64'));
  const backupDb = openSqliteDatabase(backupFile);
  const row = backupDb.prepare('SELECT pinnedAt FROM messages WHERE id = ?').get(message.id) as {
    pinnedAt: number | null;
  };

  assert.equal(row.pinnedAt, 777);
  backupDb.close();
  storage.close();
});

test('startup repair restores the current pin column and partial index', () => {
  const file = makeStorageFile();
  const storage = new Storage(file);
  storage.close();
  const damaged = openSqliteDatabase(file);
  damaged.exec(`
    DROP INDEX idx_messages_buffer_pinned;
    PRAGMA user_version = ${currentStorageSchemaVersion};
  `);
  damaged.close();

  const repaired = new Storage(file);
  repaired.close();
  const db = openSqliteDatabase(file);
  const columns = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
  const indexes = db.prepare('PRAGMA index_list(messages)').all() as Array<{ name: string; partial: number }>;
  db.close();

  assert.equal(columns.some((column) => column.name === 'pinnedAt'), true);
  assert.equal(
    indexes.find((index) => index.name === 'idx_messages_buffer_pinned')?.partial,
    1,
  );
});

const appendQueryMessage = (
  storage: Storage,
  networkId: string,
  id: string,
  ts: number,
  self: boolean,
) => storage.conversations.appendMessage({
  id,
  networkId,
  target: 'Alice',
  nick: self ? 'tester' : 'Alice',
  body: id,
  kind: id.includes('action') ? 'action' : 'line',
  self,
  ts,
});
