import assert from 'node:assert/strict';
import test from 'node:test';
import { makeStorageFile, openSqliteDatabase, Storage } from './helpers/storage-test-helpers.js';

test('versioned storage migrations rebuild networks as workspace-owned rows', () => {
  const file = makeStorageFile();
  const existing = openSqliteDatabase(file);
  const now = Date.now();

  existing.exec(`
    PRAGMA user_version = 2;
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
       (id, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'network-1',
    'Instance',
    'irc.example.test',
    6667,
    0,
    'tester',
    '["tester_","tester__"]',
    'tester',
    'Tester Example',
    'legacy-secret',
    0,
    '[]',
    now,
    now
  );
  existing.close();

  const storage = new Storage(file);
  const network = storage.networks.get('network-1');
  const upgraded = openSqliteDatabase(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const columns = upgraded.prepare('PRAGMA table_info(networks)').all() as Array<{ name: string }>;
  const bufferColumns = upgraded.prepare('PRAGMA table_info(buffers)').all() as Array<{ name: string }>;
  const tableNames = (
    upgraded.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('network_alt_nicks', 'network_historical_self_nicks', 'network_auto_join_channels', 'buffer_self_nick_aliases')
      ORDER BY name ASC
    `).all() as Array<{ name: string }>
  ).map((row) => row.name);
  upgraded.close();

  assert.equal(network?.workspaceOpen, false);
  assert.equal(network?.hasPassword, true);
  assert.equal(network?.authMethod, 'server-pass');
  assert.equal(network?.authTarget, 'NickServ');
  assert.equal(network?.authAccount, '');
  assert.deepEqual(network?.altNicks, ['tester_', 'tester__']);
  assert.deepEqual(network?.historicalSelfNicks, []);
  assert.deepEqual(network?.autoJoin, []);
  assert.equal(network?.notes, '');
  assert.equal(version.user_version, 25);
  assert.equal(columns.some((column) => column.name === 'workspaceOpen'), true);
  assert.equal(columns.some((column) => column.name === 'templateId'), false);
  assert.equal(columns.some((column) => column.name === 'managerHidden'), false);
  assert.equal(columns.some((column) => column.name === 'connectionClosed'), false);
  assert.equal(columns.some((column) => column.name === 'authMethod'), true);
  assert.equal(columns.some((column) => column.name === 'authTarget'), true);
  assert.equal(columns.some((column) => column.name === 'authAccount'), true);
  assert.equal(columns.some((column) => column.name === 'notes'), true);
  assert.equal(columns.some((column) => column.name === 'username'), false);
  assert.equal(columns.some((column) => column.name === 'historicalSelfNicks'), false);
  assert.equal(columns.some((column) => column.name === 'altNicks'), false);
  assert.equal(columns.some((column) => column.name === 'autoJoin'), false);
  assert.equal(bufferColumns.some((column) => column.name === 'selfNickAliases'), false);
  assert.equal(bufferColumns.some((column) => column.name === 'targetKey'), true);
  assert.equal(bufferColumns.some((column) => column.name === 'isOpen'), true);
  assert.equal(bufferColumns.some((column) => column.name === 'priorityUnread'), true);
  assert.equal(bufferColumns.some((column) => column.name === 'lastReadTs'), true);
  assert.equal(bufferColumns.some((column) => column.name === 'lastReadMessageId'), true);
  assert.equal(bufferColumns.some((column) => column.name === 'notes'), true);
  assert.deepEqual(tableNames, [
    'buffer_self_nick_aliases',
    'network_alt_nicks',
    'network_auto_join_channels',
    'network_historical_self_nicks',
  ]);
});
