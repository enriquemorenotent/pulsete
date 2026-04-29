import assert from 'node:assert/strict';
import test from 'node:test';
import { makeStorageFile, openSqliteDatabase, Storage } from './helpers/storage-test-helpers.js';

test('normalized storage migration can retry after leftover scratch tables from a failed attempt', () => {
  const file = makeStorageFile();
  const existing = openSqliteDatabase(file);
  const now = Date.now();

  existing.exec(`
    PRAGMA user_version = 13;
    CREATE TABLE networks (
      id TEXT PRIMARY KEY,
      templateId TEXT,
      managerHidden INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      tls INTEGER NOT NULL,
      nick TEXT NOT NULL,
      altNicks TEXT NOT NULL DEFAULT '[]',
      historicalSelfNicks TEXT NOT NULL DEFAULT '[]',
      username TEXT NOT NULL,
      realName TEXT NOT NULL DEFAULT '',
      password TEXT,
      authMethod TEXT NOT NULL DEFAULT 'none',
      authTarget TEXT NOT NULL DEFAULT 'NickServ',
      authAccount TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      autoJoin TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE buffers (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      unread INTEGER NOT NULL DEFAULT 0,
      selfNickAliases TEXT NOT NULL DEFAULT '[]',
      priorityUnread INTEGER NOT NULL DEFAULT 0,
      lastReadTs INTEGER,
      lastReadMessageId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(networkId, target)
    );
    CREATE TABLE channel_details (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL DEFAULT '',
      users TEXT NOT NULL DEFAULT '[]',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL,
      target TEXT NOT NULL,
      nick TEXT,
      speakerRole TEXT NOT NULL DEFAULT 'unknown',
      speakerNick TEXT,
      attributionSource TEXT NOT NULL DEFAULT 'unknown',
      attributionConfidence TEXT NOT NULL DEFAULT 'low',
      importBatchId TEXT,
      body TEXT NOT NULL,
      kind TEXT NOT NULL,
      self INTEGER NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE TABLE history_import_batches (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL,
      bufferId TEXT NOT NULL,
      target TEXT NOT NULL,
      selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE friends (
      id TEXT PRIMARY KEY,
      nick TEXT NOT NULL COLLATE NOCASE UNIQUE,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE networks_next (id TEXT PRIMARY KEY);
    CREATE TABLE buffers_next (id TEXT PRIMARY KEY, networkId TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, targetKey TEXT NOT NULL);
    CREATE TABLE channel_details_next (id TEXT PRIMARY KEY);
    CREATE TABLE messages_next (id TEXT PRIMARY KEY, bufferId TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL, self INTEGER NOT NULL, ts INTEGER NOT NULL);
    CREATE TABLE history_import_batches_next (id TEXT PRIMARY KEY, bufferId TEXT NOT NULL, selfNickSnapshot TEXT NOT NULL DEFAULT '[]', createdAt INTEGER NOT NULL);
  `);
  existing.prepare(
    `INSERT INTO networks
       (id, templateId, managerHidden, name, host, port, tls, nick, altNicks, historicalSelfNicks, username, realName, password, authMethod, authTarget, authAccount, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'network-1',
    null,
    0,
    'Instance',
    'irc.example.test',
    6667,
    0,
    'tester',
    '["tester_"]',
    '["tester_old"]',
    'tester',
    'Tester Example',
    null,
    'none',
    'NickServ',
    '',
    0,
    '["#help"]',
    now,
    now,
  );
  existing.prepare(
    `INSERT INTO buffers
       (id, networkId, kind, target, unread, selfNickAliases, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'buffer-1',
    'network-1',
    'query',
    'Alice',
    0,
    '["tester_old"]',
    0,
    null,
    null,
    now,
    now,
  );
  existing.prepare(
    `INSERT INTO messages
       (id, networkId, target, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'message-1',
    'network-1',
    'alice',
    'alice',
    'peer',
    'alice',
    'observed',
    'high',
    null,
    'hello from retry land',
    'line',
    0,
    now,
  );
  existing.close();

  const storage = new Storage(file);
  const upgraded = openSqliteDatabase(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const scratchTables = (
    upgraded.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name LIKE '%_next'
      ORDER BY name ASC
    `).all() as Array<{ name: string }>
  ).map((row) => row.name);
  upgraded.close();

  assert.equal(version.user_version, 22);
  assert.deepEqual(storage.conversations.listMessages('network-1', 'ALICE', 10).map((message) => message.id), ['message-1']);
  assert.deepEqual(storage.networks.get('network-1')?.autoJoin, ['#help']);
  assert.deepEqual(scratchTables, []);
});
