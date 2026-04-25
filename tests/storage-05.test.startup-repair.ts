import assert from 'node:assert/strict';
import test from 'node:test';
import { currentStorageSchemaVersion } from '../server/storage-migrations.js';
import { makeStorageFile, openSqliteDatabase, Storage } from './helpers/storage-test-helpers.js';

test('startup repair preserves explicit none auth methods on current schemas', () => {
  const file = makeStorageFile();
  const storage = new Storage(file);
  const network = storage.networks.upsert({
    workspaceOpen: false,
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

test('startup repair rebuilds missing current message search artifacts', () => {
  const file = makeStorageFile();
  const storage = new Storage(file);
  const network = storage.networks.upsert({
    workspaceOpen: true,
    name: 'SearchRepairNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: [],
    username: 'tester',
    realName: 'Tester Example',
    authMethod: 'none',
    favorite: false,
    autoJoin: [],
  });
  const buffer = storage.conversations.upsertBuffer({
    networkId: network.id,
    kind: 'channel',
    target: '#help',
  });
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: '#help',
    nick: 'alice',
    body: 'repairable search payload',
    kind: 'line',
    self: false,
    ts: Date.now(),
  });
  storage.close();

  const broken = openSqliteDatabase(file);
  broken.exec(`
    DROP TRIGGER IF EXISTS message_search_ai;
    DROP TRIGGER IF EXISTS message_search_ad;
    DROP TRIGGER IF EXISTS message_search_au;
    DROP TABLE IF EXISTS message_search_fts;
    PRAGMA user_version = ${currentStorageSchemaVersion};
  `);
  broken.close();

  const repaired = new Storage(file);
  const results = repaired.conversations.searchMessagesByBufferId(buffer.id, 'payload', 10);
  repaired.close();

  assert.deepEqual(results.messages.map((message) => message.id), ['message-1']);
});

test('startup repair migrates newer local schemas to workspace networks', () => {
  const file = makeStorageFile();
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

  assert.equal(network?.workspaceOpen, false);
  assert.deepEqual(network?.altNicks, ['tester_']);
  assert.equal(columns.some((column) => column.name === 'workspaceOpen'), true);
  assert.equal(columns.some((column) => column.name === 'templateId'), false);
  assert.equal(columns.some((column) => column.name === 'managerHidden'), false);
});
