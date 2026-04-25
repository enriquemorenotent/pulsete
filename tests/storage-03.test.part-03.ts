import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
import { Storage,type NetworkInput } from '../server/storage.js';
import type { ChannelUserState } from '../shared/protocol.js';

const makeUser = (
  nick: string,
  mode: ChannelUserState['mode'] = 'normal',
  away = false,
): ChannelUserState => ({
  nick,
  mode,
  away,
});

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  workspaceOpen: false,
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
    workspaceOpen: true,
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

test('deleteMessages removes all transcript rows for a matched buffer target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);
  storage.conversations.appendMessage({
    id: 'keep-server',
    networkId: network.id,
    target: 'server',
    nick: null,
    body: 'server line',
    kind: 'system',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'delete-1',
    networkId: network.id,
    target: 'Alice',
    nick: 'alice',
    body: 'hello',
    kind: 'line',
    self: false,
    ts: 2,
  });
  storage.conversations.appendMessage({
    id: 'delete-2',
    networkId: network.id,
    target: 'alice',
    nick: 'alice',
    body: 'world',
    kind: 'line',
    self: false,
    ts: 3,
  });

  const deleted = storage.conversations.deleteMessages(network.id, 'ALICE');

  assert.deepEqual(deleted.map((message) => message.id), ['delete-1', 'delete-2']);
  assert.deepEqual(storage.conversations.listMessages(network.id, 'alice', 10), []);
  assert.equal(storage.conversations.getMessageById('keep-server')?.body, 'server line');
});

test('buffer upserts reuse case-insensitive query and channel ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = createConnectionInstance(storage);

  const query = storage.conversations.upsertQuery(network.id, 'Alice');
  const queryUpdate = storage.conversations.upsertQuery(network.id, 'alice');
  assert.equal(queryUpdate.id, query.id);
  assert.equal(queryUpdate.target, 'alice');
  assert.equal(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);

  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#Help',
    topic: 'Original topic',
    unread: 2,
    users: [makeUser('alice')],
  });
  const channelUpdate = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'Updated topic',
  });
  assert.equal(channelUpdate.id, channel.id);
  assert.equal(channelUpdate.name, '#help');
  assert.equal(channelUpdate.topic, 'Updated topic');
  assert.equal(storage.conversations.getBuffer(channel.id)?.target, '#help');
  assert.equal(storage.conversations.listChannels(network.id).length, 1);
});

test('query alias resolution does not merge message-bearing exact nick conflicts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  let storage = new Storage(file);
  const network = createConnectionInstance(storage);
  const original = storage.conversations.upsertQuery(network.id, 'Rust');
  storage.conversations.appendMessage({
    id: 'old-rust-message',
    networkId: network.id,
    target: 'Rust',
    nick: 'Rust',
    body: 'old identity',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.recordObservedQueryNickChange(network.id, 'Rust', 'Rust-AFK');
  const exact = storage.conversations.upsertBuffer({
    id: 'exact-rust-buffer',
    networkId: network.id,
    kind: 'query',
    target: 'Rust',
  });
  storage.close();

  const db = openSqliteDatabase(file);
  db.prepare(`
    INSERT INTO messages
      (id, bufferId, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, body, kind, self, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('new-rust-message', exact.id, 'Rust', 'peer', 'Rust', 'runtime', 'high', 'new identity', 'line', 0, 2);
  db.close();

  storage = new Storage(file);
  const opened = storage.conversations.upsertQuery(network.id, 'Rust');
  const exactBodies = storage.conversations.listMessages(network.id, 'Rust', 10).map((message) => message.body);
  const aliasBodies = storage.conversations.listMessages(network.id, 'Rust-AFK', 10).map((message) => message.body);

  assert.equal(opened.id, exact.id);
  assert.equal(opened.id !== original.id, true);
  assert.deepEqual(exactBodies, ['new identity']);
  assert.deepEqual(aliasBodies, ['old identity']);
});

test('storage accepts workspace state changes on saved networks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
  }));

  const opened = storage.networks.upsert({ ...network, workspaceOpen: true });
  const closed = storage.networks.upsert({ ...opened, workspaceOpen: false });

  assert.equal(opened.workspaceOpen, true);
  assert.equal(closed.workspaceOpen, false);
});
