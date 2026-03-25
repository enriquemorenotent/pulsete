import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Storage,type NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  templateId: null,
  managerHidden: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

const createConnectionInstance = (storage: Storage, overrides: Partial<NetworkInput> = {}) => {
  const template = storage.networks.upsert(createNetworkInput({
    name: overrides.name ?? 'TemplateNet',
    host: overrides.host ?? 'irc.example.test',
    port: overrides.port ?? 6667,
    tls: overrides.tls ?? false,
  }));
  return storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: overrides.name ?? template.name,
    host: overrides.host ?? template.host,
    port: overrides.port ?? template.port,
    tls: overrides.tls ?? template.tls,
    nick: overrides.nick ?? template.nick,
    altNicks: overrides.altNicks ?? template.altNicks,
    username: overrides.username ?? template.username,
    realName: overrides.realName ?? template.realName,
    favorite: overrides.favorite ?? template.favorite,
    autoJoin: overrides.autoJoin ?? template.autoJoin,
  }));
};

test('existing local databases reset stored messages and unread counts on the formatting upgrade', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const existing = new DatabaseSync(file);
  const now = Date.now();
  existing.exec(`
    PRAGMA user_version = 0;
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
  `);
  existing.prepare(
    `INSERT INTO networks
       (id, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'network-1',
    null,
    1,
    'Instance',
    'irc.example.test',
    6667,
    0,
    'tester',
    '["tester_","tester__"]',
    'tester',
    'Tester Example',
    null,
    0,
    '[]',
    now,
    now
  );
  existing.prepare(
    `INSERT INTO buffers
       (id, networkId, kind, target, unread, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('buffer-1', 'network-1', 'channel', '#help', 4, now, now);
  existing.prepare(
    `INSERT INTO channel_details
       (id, topic, users, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`
  ).run('buffer-1', 'Topic', '["alice"]', now, now);
  existing.prepare(
    `INSERT INTO messages
       (id, networkId, target, nick, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('message-1', 'network-1', '#help', 'alice', 'old stripped message', 'line', 0, now);
  existing.close();

  const storage = new Storage(file);
  const snapshot = storage.snapshot();

  assert.deepEqual(snapshot.messages, []);
  assert.equal(snapshot.buffers.find((buffer) => buffer.id === 'buffer-1')?.unread, 0);

  const upgraded = new DatabaseSync(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const count = upgraded.prepare('SELECT COUNT(*) AS count FROM messages').get() as { count: number };
  upgraded.close();

  assert.equal(version.user_version, 8);
  assert.equal(count.count, 0);
});

test('friends persist and deduplicate case-insensitively', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  const friend = storage.friends.upsert({ nick: 'Alice' });
  const duplicate = storage.friends.upsert({ nick: 'alice' });
  storage.close();

  const reopened = new Storage(file);
  const friends = reopened.friends.list();

  assert.equal(duplicate.id, friend.id);
  assert.deepEqual(friends, [friend]);

  const removed = reopened.friends.remove(friend.id);
  assert.equal(removed?.id, friend.id);
  assert.deepEqual(reopened.friends.list(), []);
});

test('deleting a template removes hidden clones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
  }));

  storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet clone',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
  }));

  assert.equal(
    storage.networks.list().filter((network) => network.id === template.id || network.templateId === template.id).length,
    2
  );
  storage.networks.delete(template.id);
  assert.equal(storage.networks.list().some((network) => network.id === template.id), false);
  assert.equal(storage.networks.list().some((network) => network.templateId === template.id), false);
});

test('query buffers persist and can be closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);

  const query = storage.conversations.upsertQuery(network.id, 'helper');
  assert.equal(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);
  assert.equal(storage.snapshot().buffers.some((buffer) => buffer.id === query.id), true);

  storage.conversations.removeBuffer(query.id);
  assert.deepEqual(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  assert.equal(storage.snapshot().buffers.some((buffer) => buffer.id === query.id), false);
});
