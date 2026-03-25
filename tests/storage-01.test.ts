import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync,mkdtempSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Storage,type NetworkInput } from '../server/storage.js';
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

test('listNetworks seeds fixed local networks without requiring a snapshot first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));

  const networks = storage.networks.list();

  assert.equal(networks.length, 4);
  assert.deepEqual(
    networks.map((network) => network.name),
    ['Libera.Chat', 'OFTC', 'Snoonet', 'IRCnet']
  );
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

  const channel = storage.conversations.upsertChannel({
    id: randomUUID(),
    networkId: network.id,
    name: '#archlinux',
    topic: 'support',
    unread: 2,
    users: [makeUser('alice'), makeUser('bob')],
  });
  const query = storage.conversations.upsertQuery(network.id, 'helper');
  const friend = storage.friends.upsert({ nick: 'alice' });
  const message = storage.conversations.appendMessage({
    id: randomUUID(),
    networkId: network.id,
    target: '#archlinux',
    nick: 'alice',
    body: 'hello world',
    kind: 'line',
    self: true,
    ts: Date.now(),
  });

  assert.deepEqual(storage.networks.get(network.id), {
    ...network,
    favorite: true,
    autoJoin: ['#archlinux'],
    hasPassword: false,
  });
  assert.deepEqual(storage.conversations.getChannel(channel.id), channel);
  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper')?.id, query.id);
  assert.deepEqual(storage.conversations.listMessages(network.id, '#archlinux', 10), [message]);
  assert.equal(storage.friends.list()[0]?.id, friend.id);

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
  const publicTables = tables
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('messages_fts_'));
  assert.deepEqual(
    publicTables,
    ['assistant_preferences', 'assistant_threads', 'buffers', 'channel_details', 'friends', 'messages', 'messages_fts', 'networks']
  );
});
