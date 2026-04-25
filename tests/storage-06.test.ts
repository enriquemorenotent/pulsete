import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
import { Storage } from '../server/storage.js';

const createLegacyV13Database = (file: string) => {
  const db = openSqliteDatabase(file);
  const now = Date.now();
  db.exec(`
    PRAGMA user_version = 13;
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
      historicalSelfNicks TEXT NOT NULL DEFAULT '[]',
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
      selfNickAliases TEXT NOT NULL DEFAULT '[]',
      unread INTEGER NOT NULL DEFAULT 0,
      priorityUnread INTEGER NOT NULL DEFAULT 0,
      lastReadTs INTEGER,
      lastReadMessageId TEXT,
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
  db.prepare(`
    INSERT INTO networks
      (id, templateId, managerHidden, name, host, port, tls, nick, altNicks, historicalSelfNicks, username, realName, password, authMethod, authTarget, authAccount, favorite, autoJoin, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'network-1',
    null,
    0,
    'ArchiveNet',
    'irc.example.test',
    6697,
    1,
    'sofia',
    '["sofia_","sofia__"]',
    '["sofia-old"]',
    'sofia',
    'Sofia Example',
    null,
    'none',
    'NickServ',
    '',
    1,
    '["#help"]',
    now,
    now,
  );
  db.prepare(`
    INSERT INTO buffers
      (id, networkId, kind, target, selfNickAliases, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('buffer-help', 'network-1', 'channel', '#help', '["sofia-import"]', 3, 1, now - 1000, 'help-599', now, now);
  db.prepare(`
    INSERT INTO channel_details (id, topic, users, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run('buffer-help', 'Archives', '["alice","bob"]', now, now);

  const insertMessage = db.prepare(`
    INSERT INTO messages
      (id, networkId, target, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertBatch = db.prepare(`
    INSERT INTO history_import_batches (id, networkId, bufferId, target, selfNickSnapshot, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  for (let index = 0; index < 600; index += 1) {
    insertMessage.run(`help-${index}`, 'network-1', '#help', 'alice', 'other', 'alice', 'history-import', 'high', null, `help line ${index}`, 'line', 0, now + index);
  }
  for (let index = 0; index < 400; index += 1) {
    insertMessage.run(`query-${index}`, 'network-1', 'MissD', 'MissD', 'other', 'MissD', 'history-import', 'high', null, `query line ${index}`, 'line', 0, now + 1_000 + index);
  }
  for (let index = 0; index < 200; index += 1) {
    insertMessage.run(`logs-${index}`, 'network-1', '#Logs', 'bob', 'other', 'bob', 'history-import', 'high', null, `logs line ${index}`, 'line', 0, now + 2_000 + index);
  }
  insertBatch.run('batch-help', 'network-1', 'buffer-help', '#help', '["sofia-import"]', now - 10);
  insertBatch.run('batch-query', 'network-1', 'legacy-query-buffer', 'MissD', '["sofia-import"]', now - 9);
  insertBatch.run('batch-logs', 'network-1', 'legacy-logs-buffer', '#Logs', '["sofia-import"]', now - 8);
  db.exec('COMMIT');
  db.close();
};

test('normalized storage migration preserves large transcripts and backfills missing buffers in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  createLegacyV13Database(file);

  const storage = new Storage(file);
  storage.close();

  const upgraded = openSqliteDatabase(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const messageCount = upgraded.prepare('SELECT COUNT(*) AS count FROM messages').get() as { count: number };
  const batchCount = upgraded.prepare('SELECT COUNT(*) AS count FROM history_import_batches').get() as { count: number };
  const migratedBuffers = upgraded.prepare(`
    SELECT buffers.target, buffers.targetKey, buffers.kind, buffers.isOpen, COUNT(messages.id) AS messageCount
    FROM buffers
    LEFT JOIN messages ON messages.bufferId = buffers.id
    WHERE buffers.networkId = ?
      AND buffers.target IN ('#help', 'MissD', '#Logs')
    GROUP BY buffers.id
    ORDER BY buffers.target ASC
  `).all('network-1') as Array<{
    target: string;
    targetKey: string;
    kind: string;
    isOpen: number;
    messageCount: number;
  }>;
  const batchTargets = upgraded.prepare(`
    SELECT buffers.target, COUNT(history_import_batches.id) AS batchCount
    FROM history_import_batches
    JOIN buffers ON buffers.id = history_import_batches.bufferId
    WHERE buffers.networkId = ?
      AND buffers.target IN ('#help', 'MissD', '#Logs')
    GROUP BY buffers.id
    ORDER BY buffers.target ASC
  `).all('network-1') as Array<{ target: string; batchCount: number }>;
  upgraded.close();

  assert.equal(version.user_version, 19);
  assert.equal(messageCount.count, 1_200);
  assert.equal(batchCount.count, 3);
  assert.deepEqual(migratedBuffers, [
    { target: '#Logs', targetKey: '#logs', kind: 'channel', isOpen: 0, messageCount: 200 },
    { target: '#help', targetKey: '#help', kind: 'channel', isOpen: 1, messageCount: 600 },
    { target: 'MissD', targetKey: 'missd', kind: 'query', isOpen: 0, messageCount: 400 },
  ]);
  assert.deepEqual(batchTargets, [
    { target: '#Logs', batchCount: 1 },
    { target: '#help', batchCount: 1 },
    { target: 'MissD', batchCount: 1 },
  ]);
});
