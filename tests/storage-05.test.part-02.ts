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
    'Wait for me in the hotel room.',
    'line',
    0,
    now,
  );
  existing.close();

  const storage = new Storage(file);
  const searchResults = storage.conversations.searchMessages('network-1', 'missd', 'hotel', 10);
  const upgraded = openSqliteDatabase(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const indexCount = upgraded.prepare('SELECT COUNT(*) AS count FROM messages_fts').get() as { count: number };
  upgraded.close();

  assert.equal(version.user_version, 14);
  assert.deepEqual(searchResults.map((result) => result.message.id), ['message-1']);
  assert.equal(indexCount.count, 1);
});
