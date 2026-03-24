import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Storage } from '../server/storage.js';

test('versioned storage migrations add template metadata columns incrementally', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const existing = new DatabaseSync(file);
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
  const upgraded = new DatabaseSync(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const columns = upgraded.prepare('PRAGMA table_info(networks)').all() as Array<{ name: string }>;
  upgraded.close();

  assert.equal(network?.templateId, null);
  assert.equal(network?.managerHidden, false);
  assert.equal(network?.hasPassword, true);
  assert.equal(network?.authMethod, 'server-pass');
  assert.equal(network?.authTarget, 'NickServ');
  assert.equal(network?.authAccount, '');
  assert.equal(version.user_version, 6);
  assert.equal(columns.some((column) => column.name === 'templateId'), true);
  assert.equal(columns.some((column) => column.name === 'managerHidden'), true);
  assert.equal(columns.some((column) => column.name === 'authMethod'), true);
  assert.equal(columns.some((column) => column.name === 'authTarget'), true);
  assert.equal(columns.some((column) => column.name === 'authAccount'), true);
});

test('startup repairs auth columns even when user_version already claims the latest schema', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const existing = new DatabaseSync(file);
  const now = Date.now();

  existing.exec(`
    PRAGMA user_version = 6;
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
       (id, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    'legacy-secret',
    0,
    '[]',
    now,
    now
  );
  existing.close();

  const storage = new Storage(file);
  const network = storage.networks.get('network-1');
  const upgraded = new DatabaseSync(file);
  const columns = upgraded.prepare('PRAGMA table_info(networks)').all() as Array<{ name: string }>;
  upgraded.close();

  assert.equal(network?.authMethod, 'server-pass');
  assert.equal(network?.authTarget, 'NickServ');
  assert.equal(network?.authAccount, '');
  assert.equal(columns.some((column) => column.name === 'authAccount'), true);
});

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
