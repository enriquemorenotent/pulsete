import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
import { Storage } from '../server/storage.js';

test('startup repair preserves explicit none auth methods on current schemas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const network = storage.networks.upsert({
    templateId: null,
    managerHidden: false,
    name: 'StoredSecretNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
    authMethod: 'none',
    password: 'secret',
    favorite: false,
    autoJoin: [],
  });
  storage.close();

  const reopened = new Storage(file);
  const reopenedNetwork = reopened.networks.get(network.id);

  assert.equal(reopenedNetwork?.authMethod, 'none');
  assert.equal(reopenedNetwork?.hasPassword, true);
});

test('startup repair backfills legacy template columns for newer local schemas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const existing = openSqliteDatabase(file);
  const now = Date.now();

  existing.exec(`
    PRAGMA user_version = 15;
    CREATE TABLE networks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      tls INTEGER NOT NULL,
      nick TEXT NOT NULL,
      username TEXT NOT NULL,
      realName TEXT NOT NULL DEFAULT '',
      password TEXT,
      authMethod TEXT NOT NULL DEFAULT 'none',
      authTarget TEXT NOT NULL DEFAULT 'NickServ',
      authAccount TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE network_alt_nicks (
      networkId TEXT NOT NULL,
      position INTEGER NOT NULL,
      nick TEXT NOT NULL,
      nickKey TEXT NOT NULL,
      PRIMARY KEY (networkId, nickKey),
      UNIQUE (networkId, position)
    );
    CREATE TABLE network_historical_self_nicks (
      networkId TEXT NOT NULL,
      position INTEGER NOT NULL,
      nick TEXT NOT NULL,
      nickKey TEXT NOT NULL,
      PRIMARY KEY (networkId, nickKey),
      UNIQUE (networkId, position)
    );
    CREATE TABLE network_auto_join_channels (
      networkId TEXT NOT NULL,
      position INTEGER NOT NULL,
      channel TEXT NOT NULL,
      channelKey TEXT NOT NULL,
      PRIMARY KEY (networkId, channelKey),
      UNIQUE (networkId, position)
    );
    CREATE TABLE buffers (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      targetKey TEXT NOT NULL,
      isOpen INTEGER NOT NULL DEFAULT 1,
      unread INTEGER NOT NULL DEFAULT 0,
      priorityUnread INTEGER NOT NULL DEFAULT 0,
      lastReadTs INTEGER,
      lastReadMessageId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(networkId, targetKey)
    );
    CREATE TABLE buffer_self_nick_aliases (
      bufferId TEXT NOT NULL,
      position INTEGER NOT NULL,
      nick TEXT NOT NULL,
      nickKey TEXT NOT NULL,
      PRIMARY KEY (bufferId, nickKey),
      UNIQUE (bufferId, position)
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
      bufferId TEXT NOT NULL,
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
    CREATE TABLE muted_nicks (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL,
      nick TEXT NOT NULL COLLATE NOCASE,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(networkId, nick)
    );
  `);
  existing.prepare(`
    INSERT INTO networks
      (id, name, host, port, tls, nick, username, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'network-1',
    'ForwardSchemaNet',
    'irc.example.test',
    6667,
    0,
    'tester',
    'tester',
    'Tester Example',
    null,
    'none',
    'NickServ',
    '',
    0,
    now,
    now,
  );
  existing.prepare(`
    INSERT INTO network_alt_nicks (networkId, position, nick, nickKey)
    VALUES (?, ?, ?, ?)
  `).run('network-1', 0, 'tester_', 'tester_');
  existing.close();

  const storage = new Storage(file);
  const network = storage.networks.get('network-1');
  storage.close();

  const upgraded = openSqliteDatabase(file);
  const columns = upgraded.prepare('PRAGMA table_info(networks)').all() as Array<{ name: string }>;
  upgraded.close();

  assert.equal(network?.templateId, null);
  assert.equal(network?.managerHidden, false);
  assert.deepEqual(network?.altNicks, ['tester_']);
  assert.equal(columns.some((column) => column.name === 'templateId'), true);
  assert.equal(columns.some((column) => column.name === 'managerHidden'), true);
});

test('versioned storage migrations rebuild the message search index for existing transcripts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const existing = openSqliteDatabase(file);
  const now = Date.now();

  existing.exec(`
    PRAGMA user_version = 7;
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
      body TEXT NOT NULL,
      kind TEXT NOT NULL,
      self INTEGER NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE TABLE friends (
      id TEXT PRIMARY KEY,
      nick TEXT NOT NULL COLLATE NOCASE UNIQUE,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  existing.prepare(
    `INSERT INTO networks
       (id, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, authMethod, authTarget, authAccount, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'network-1',
    null,
    0,
    'Instance',
    'irc.example.test',
    6667,
    0,
    'tester',
    '["tester_","tester__"]',
    'tester',
    'Tester Example',
    null,
    'none',
    'NickServ',
    '',
    0,
    '[]',
    now,
    now
  );
  existing.prepare(
    `INSERT INTO messages (id, networkId, target, nick, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'message-1',
    'network-1',
    'MissD',
    'MissD',
    'Wait for me in the c++ room.',
    'line',
    0,
    now,
  );
  existing.close();

  const storage = new Storage(file);
  const searchResults = storage.conversations.searchMessages('network-1', 'missd', 'c++ room', 10);
  const upgraded = openSqliteDatabase(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const indexCount = upgraded.prepare('SELECT COUNT(*) AS count FROM messages_fts').get() as { count: number };
  upgraded.close();

  assert.equal(version.user_version, 14);
  assert.deepEqual(searchResults.map((result) => result.message.id), ['message-1']);
  assert.equal(indexCount.count, 1);
});

test('startup repair rebuilds legacy message search tokenizers on current schemas', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const network = storage.networks.upsert({
    templateId: null,
    managerHidden: false,
    name: 'Instance',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
    favorite: false,
    autoJoin: [],
  });
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: 'MissD',
    nick: 'MissD',
    body: 'Wait for me in the c++ room.',
    kind: 'line',
    self: false,
    ts: Date.now(),
  });
  storage.close();

  const legacy = openSqliteDatabase(file);
  legacy.exec(`
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TABLE IF EXISTS messages_fts;
    CREATE VIRTUAL TABLE messages_fts
      USING fts5(
        messageId UNINDEXED,
        bufferId UNINDEXED,
        nick,
        body,
        tokenize = 'porter unicode61'
      );
    INSERT INTO messages_fts (rowid, messageId, bufferId, nick, body)
    SELECT rowid, id, bufferId, coalesce(nick, ''), body
    FROM messages;
  `);
  legacy.close();

  const reopened = new Storage(file);
  const searchResults = reopened.conversations.searchMessages(network.id, 'missd', 'c++ room', 10);
  reopened.close();

  const repaired = openSqliteDatabase(file);
  const indexSql = repaired.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'messages_fts'
  `).get() as { sql: string };
  repaired.close();

  assert.deepEqual(searchResults.map((result) => result.message.id), ['message-1']);
  assert.match(indexSql.sql, /tokenize\s*=\s*'trigram'/i);
});
