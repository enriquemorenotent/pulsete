import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
import { Storage, type NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

test('observed query nick changes merge message-bearing source and destination buffers', () => {
  const storage = new Storage(join(mkdtempSync(join(tmpdir(), 'pulsete-storage-')), 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const original = storage.conversations.upsertQuery(network.id, 'helper');
  const destination = storage.conversations.upsertQuery(network.id, 'guide');
  storage.conversations.appendMessage({
    id: 'helper-message',
    networkId: network.id,
    target: 'helper',
    nick: 'helper',
    body: 'old buffer',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'guide-message',
    networkId: network.id,
    target: 'guide',
    nick: 'guide',
    body: 'new buffer',
    kind: 'line',
    self: false,
    ts: 2,
  });

  const renamed = storage.conversations.recordObservedQueryNickChange(network.id, 'helper', 'guide');

  assert.equal(renamed?.buffer.id, original.id);
  assert.deepEqual(renamed?.removedBufferIds, [destination.id]);
  assert.equal(storage.conversations.getBuffer(destination.id), null);
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'guide', 10).map((message) => message.body),
    ['old buffer', 'new buffer'],
  );
});

test('query alias resolution does not guess between multiple message-bearing candidates', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'pulsete-storage-')), 'db.sqlite');
  let storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput());
  const rustAfk = storage.conversations.upsertQuery(network.id, 'Rust-AFK');
  const rustWork = storage.conversations.upsertQuery(network.id, 'RustWork');
  storage.conversations.appendMessage({
    id: 'rust-afk-message',
    networkId: network.id,
    target: 'Rust-AFK',
    nick: 'Rust-AFK',
    body: 'afk identity',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'rust-work-message',
    networkId: network.id,
    target: 'RustWork',
    nick: 'RustWork',
    body: 'work identity',
    kind: 'line',
    self: false,
    ts: 2,
  });
  storage.close();

  const db = openSqliteDatabase(file);
  const now = Date.now();
  const insertAlias = db.prepare(`
    INSERT INTO query_nick_aliases
      (bufferId, networkId, nick, nickKey, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertAlias.run(rustAfk.id, network.id, 'Rust', 'rust', now, now, 'nick-change');
  insertAlias.run(rustWork.id, network.id, 'Rust', 'rust', now, now, 'nick-change');
  db.close();

  storage = new Storage(file);
  const opened = storage.conversations.upsertQuery(network.id, 'Rust');

  assert.notEqual(opened.id, rustAfk.id);
  assert.notEqual(opened.id, rustWork.id);
  assert.equal(opened.target, 'Rust');
  assert.deepEqual(storage.conversations.listMessages(network.id, 'Rust', 10), []);
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'Rust-AFK', 10).map((message) => message.body),
    ['afk identity'],
  );
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'RustWork', 10).map((message) => message.body),
    ['work identity'],
  );
});

test('query peer identity migration backfills stable identities without moving logs', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'pulsete-storage-')), 'db.sqlite');
  let storage = new Storage(file);
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertQuery(network.id, 'helper');
  storage.conversations.appendMessage({
    id: 'identity-backed-message',
    networkId: network.id,
    target: 'helper',
    nick: 'helper',
    senderIdentity: { kind: 'account', value: 'helper-account' },
    body: 'stable identity',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.close();

  const db = openSqliteDatabase(file);
  db.exec(`
    DROP TABLE query_peer_identities;
    PRAGMA user_version = 24;
  `);
  db.close();

  storage = new Storage(file);

  assert.deepEqual(
    storage.conversations.getBuffer(query.id)?.peerIdentity,
    { kind: 'account', value: 'helper-account' },
  );
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'helper', 10).map((message) => message.body),
    ['stable identity'],
  );
});

test('self-sent private message storage fallback ignores sender identity routing', () => {
  const storage = new Storage(join(mkdtempSync(join(tmpdir(), 'pulsete-storage-')), 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const pollutedQuery = storage.conversations.upsertQuery(
    network.id,
    'oldPeer',
    { kind: 'account', value: 'tester' },
  );

  storage.conversations.appendMessage({
    id: 'self-message',
    networkId: network.id,
    target: 'alicia',
    nick: 'tester',
    senderIdentity: { kind: 'account', value: 'tester' },
    body: 'Hi',
    kind: 'line',
    self: true,
    ts: 1,
  });

  assert.equal(storage.conversations.getBuffer(pollutedQuery.id)?.target, 'oldPeer');
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'alicia', 10).map((message) => message.body),
    ['Hi'],
  );
  assert.deepEqual(storage.conversations.listMessages(network.id, 'oldPeer', 10), []);
});
