import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Storage, type NetworkInput } from '../server/storage.js';
import type { ChannelUserState } from '../shared/protocol.js';

const makeUser = (nick: string, mode: ChannelUserState['mode'] = 'normal'): ChannelUserState => ({
  nick,
  mode,
});

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
  const template = storage.upsertNetwork(createNetworkInput({
    name: overrides.name ?? 'TemplateNet',
    host: overrides.host ?? 'irc.example.test',
    port: overrides.port ?? 6667,
    tls: overrides.tls ?? false,
  }));
  return storage.upsertNetwork(createNetworkInput({
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

test('snapshot seeds fixed local networks and no open buffers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));

  const snapshot = storage.snapshot();

  assert.deepEqual(
    snapshot.networks.map((network) => [network.name, network.host, network.port, network.tls]),
    [
      ['Libera.Chat', 'irc.libera.chat', 6697, true],
      ['OFTC', 'irc.oftc.net', 6697, true],
      ['Snoonet', 'irc.snoonet.org', 6697, true],
      ['IRCnet', 'irc.ircnet.com', 6667, false],
    ]
  );
  assert.equal(snapshot.networks[0]?.nick, 'pulsete');
  assert.deepEqual(snapshot.networks[0]?.altNicks, ['pulsete_', 'pulsete__']);
  assert.equal(snapshot.networks[0]?.username, 'pulsete');
  assert.equal(snapshot.networks[0]?.realName, 'Pulsete');
  assert.deepEqual(snapshot.buffers, []);
  assert.deepEqual(snapshot.friends, []);
  assert.deepEqual(snapshot.channels, []);
  assert.deepEqual(snapshot.messages, []);
});

test('legacy bootstrap helpers do not change fixed local defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));

  storage.bootstrapUser('alice', 'secret');
  const snapshot = storage.snapshot();

  assert.equal(snapshot.networks[0]?.nick, 'pulsete');
  assert.equal(snapshot.networks[0]?.username, 'pulsete');
  assert.equal(snapshot.networks[0]?.realName, 'Pulsete');
  assert.deepEqual(snapshot.friends, []);
});

test('storage persists local workspace buffers and messages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage, {
    name: 'Libera',
    host: 'irc.libera.chat',
    port: 6697,
    tls: true,
    favorite: true,
    autoJoin: ['#archlinux'],
  });

  const channel = storage.upsertChannel({
    id: randomUUID(),
    networkId: network.id,
    name: '#archlinux',
    topic: 'support',
    unread: 2,
    users: [makeUser('alice'), makeUser('bob')],
  });
  const query = storage.upsertQuery(network.id, 'helper');
  const friend = storage.upsertFriend({ nick: 'alice' });
  const message = storage.appendMessage({
    id: randomUUID(),
    networkId: network.id,
    target: '#archlinux',
    nick: 'alice',
    body: 'hello world',
    kind: 'line',
    self: true,
    ts: Date.now(),
  });

  assert.deepEqual(storage.getNetwork(network.id), {
    ...network,
    favorite: true,
    autoJoin: ['#archlinux'],
    hasPassword: false,
  });
  assert.deepEqual(storage.getChannel(channel.id), channel);
  assert.equal(storage.getBufferByTarget(network.id, 'helper')?.id, query.id);
  assert.deepEqual(storage.listMessages(network.id, '#archlinux', 10), [message]);
  assert.equal(storage.listFriends()[0]?.id, friend.id);

  const snapshot = storage.snapshot();
  assert.equal(snapshot.friends[0]?.id, friend.id);
  assert.equal(snapshot.channels[0]?.id, channel.id);
  assert.equal(
    snapshot.buffers.some((buffer) => buffer.networkId === network.id && buffer.kind === 'server' && buffer.target === 'server'),
    true
  );
  assert.equal(snapshot.buffers.some((buffer) => buffer.id === channel.id && buffer.unread === 2), true);
  assert.equal(snapshot.buffers.some((buffer) => buffer.id === query.id && buffer.kind === 'query'), true);
  assert.equal(snapshot.messages.at(-1)?.id, message.id);
});

test('legacy auth databases are backed up and replaced with a fresh local database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      salt TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE networks (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
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
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  legacy.close();

  const storage = new Storage(file);
  const snapshot = storage.snapshot();

  const backups = readdirSync(dir).filter((name) => name.startsWith('db.sqlite.legacy-'));
  assert.equal(backups.length, 1);
  assert.equal(existsSync(join(dir, backups[0]!)), true);
  assert.equal(snapshot.networks.length, 4);

  const fresh = new DatabaseSync(file);
  const tables = fresh.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>;
  fresh.close();
  assert.deepEqual(
    tables.map((entry) => entry.name),
    ['buffers', 'channel_details', 'friends', 'messages', 'networks']
  );
});

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

  assert.equal(version.user_version, 2);
  assert.equal(count.count, 0);
});

test('friends persist and deduplicate case-insensitively', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);

  const friend = storage.upsertFriend({ nick: 'Alice' });
  const duplicate = storage.upsertFriend({ nick: 'alice' });
  storage.close();

  const reopened = new Storage(file);
  const friends = reopened.listFriends();

  assert.equal(duplicate.id, friend.id);
  assert.deepEqual(friends, [friend]);

  const removed = reopened.removeFriend(friend.id);
  assert.equal(removed?.id, friend.id);
  assert.deepEqual(reopened.listFriends(), []);
});

test('deleting a template removes hidden clones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
  }));

  storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet clone',
    nick: 'templated',
    altNicks: ['templated_', 'templated__'],
    username: 'templated',
    realName: 'templated',
  }));

  assert.equal(storage.listNetworks().length, 2);
  storage.deleteNetwork(template.id);
  assert.deepEqual(storage.listNetworks(), []);
});

test('query buffers persist and can be closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);

  const query = storage.upsertQuery(network.id, 'helper');
  assert.equal(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);
  assert.equal(storage.snapshot().buffers.some((buffer) => buffer.id === query.id), true);

  storage.removeBuffer(query.id);
  assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  assert.equal(storage.snapshot().buffers.some((buffer) => buffer.id === query.id), false);
});

test('query buffers and history match IRC nick casing insensitively', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  const query = storage.upsertQuery(network.id, 'Alice');
  const message = storage.appendMessage({
    id: randomUUID(),
    networkId: network.id,
    target: 'alice',
    nick: 'alice',
    body: 'hello there',
    kind: 'line',
    self: false,
    ts: Date.now(),
  });

  assert.equal(storage.getBufferByTarget(network.id, 'ALICE')?.id, query.id);
  assert.deepEqual(storage.listMessages(network.id, 'ALICE', 10), [message]);
});

test('storage rejects invalid template relationships', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
  }));

  assert.throws(
    () =>
      storage.upsertNetwork(createNetworkInput({
        ...template,
        id: undefined,
        templateId: template.id,
        managerHidden: false,
        name: 'Visible clone',
      })),
    /Saved networks cannot reference a template/
  );
  assert.throws(
    () =>
      storage.upsertNetwork(createNetworkInput({
        ...template,
        id: undefined,
        templateId: null,
        managerHidden: true,
        name: 'Orphan instance',
      })),
    /Connection instances must reference an existing saved network/
  );
  assert.throws(
    () =>
      storage.upsertNetwork(createNetworkInput({
        ...template,
        id: undefined,
        templateId: 'missing-template',
        managerHidden: true,
        name: 'Broken instance',
      })),
    /Connection instances must reference an existing saved network/
  );
});

test('storage rejects changing a template relationship after creation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
  }));
  const otherTemplate = storage.upsertNetwork(createNetworkInput({
    name: 'OtherTemplateNet',
    host: 'irc2.example.test',
    port: 6697,
    tls: true,
  }));
  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
  }));

  assert.throws(
    () =>
      storage.upsertNetwork({
        ...template,
        templateId: otherTemplate.id,
        managerHidden: true,
      }),
    /Network template relationship cannot be changed after creation/
  );
  assert.throws(
    () =>
      storage.upsertNetwork({
        ...clone,
        templateId: null,
        managerHidden: false,
      }),
    /Network template relationship cannot be changed after creation/
  );
  assert.throws(
    () =>
      storage.upsertNetwork({
        ...clone,
        templateId: otherTemplate.id,
      }),
    /Network template relationship cannot be changed after creation/
  );
});

test('network passwords stay encrypted at rest, inherit on hidden clones, and can be cleared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const network = storage.upsertNetwork(createNetworkInput({
    name: 'SecretNet',
    port: 6697,
    tls: true,
    password: 'server-secret',
  }));

  const publicProfile = storage.getNetwork(network.id);
  assert.equal(publicProfile?.hasPassword, true);
  assert.equal((publicProfile as { password?: string } | null)?.password, undefined);
  assert.equal(storage.getRuntimeNetwork(network.id)?.password, 'server-secret');

  const db = new DatabaseSync(file);
  const row = db.prepare('SELECT password FROM networks WHERE id = ?').get(network.id) as { password: string };
  db.close();
  assert.notEqual(row.password, 'server-secret');
  assert.match(row.password, /^enc-v1:/);

  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: network.id,
    managerHidden: true,
    name: 'SecretNet clone',
    port: 6697,
    tls: true,
  }));
  assert.equal(clone.hasPassword, true);
  assert.equal(storage.getRuntimeNetwork(clone.id)?.password, 'server-secret');

  storage.upsertNetwork({
    ...network,
    password: '',
  });
  assert.equal(storage.getRuntimeNetwork(network.id)?.password, 'server-secret');

  storage.upsertNetwork({
    ...network,
    clearPassword: true,
  });
  assert.equal(storage.getNetwork(network.id)?.hasPassword, false);
  assert.equal(storage.getRuntimeNetwork(network.id)?.password, undefined);
});

test('storage fails fast when encrypted passwords exist but the secret key is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  storage.upsertNetwork(createNetworkInput({
    name: 'SecretNet',
    port: 6697,
    tls: true,
    password: 'server-secret',
  }));

  unlinkSync(join(dir, 'pulsete.secret'));

  assert.throws(() => new Storage(file), /Missing network secret key/);
});

test('storage close is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));

  storage.close();
  storage.close();

  assert.ok(true);
});
