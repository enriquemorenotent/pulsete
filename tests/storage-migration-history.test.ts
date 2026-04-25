import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { currentStorageSchemaVersion } from '../server/storage-migrations.js';
import { openSqliteDatabase } from '../server/storage-sqlite.js';
import { Storage } from '../server/storage.js';

test('legacy formatting upgrade preserves messages, unread counts, and a backup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');
  const now = Date.now();
  createLegacyFormattingDatabase(file, now);

  const storage = new Storage(file);
  const snapshot = storage.snapshot();
  storage.close();

  const message = snapshot.messages[0];
  assert.equal(snapshot.messages.length, 1);
  assert.equal(message?.id, 'message-1');
  assert.equal(message?.networkId, 'network-1');
  assert.equal(message?.target, '#help');
  assert.equal(message?.nick, 'alice');
  assert.equal(message?.body, 'old stripped message');
  assert.equal(message?.kind, 'line');
  assert.equal(message?.self, false);
  assert.equal(message?.ts, now);
  assert.equal(snapshot.buffers.find((buffer) => buffer.id === 'buffer-1')?.unread, 4);

  const upgraded = openSqliteDatabase(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const count = upgraded.prepare('SELECT COUNT(*) AS count FROM messages').get() as { count: number };
  const migrated = upgraded.prepare(`
    SELECT m.id, m.bufferId, b.networkId, b.target, m.body
    FROM messages AS m
    JOIN buffers AS b ON b.id = m.bufferId
  `).get() as { id: string; bufferId: string; networkId: string; target: string; body: string } | undefined;
  upgraded.close();

  assert.equal(version.user_version, 18);
  assert.equal(count.count, 1);
  assert.deepEqual(migrated, {
    id: 'message-1',
    bufferId: 'buffer-1',
    networkId: 'network-1',
    target: '#help',
    body: 'old stripped message',
  });
  assert.equal(readBackupMessageCount(dir), 1);
});

test('current local databases do not create pre-migration backups', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-storage-'));
  const file = join(dir, 'db.sqlite');

  const storage = new Storage(file);
  storage.close();
  const reopened = new Storage(file);
  reopened.close();

  assert.equal(existsSync(join(dir, 'backups')), false);
});

const createLegacyFormattingDatabase = (file: string, now: number) => {
  const existing = openSqliteDatabase(file);
  existing.exec(`
    PRAGMA user_version = 0;
    CREATE TABLE networks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      tls INTEGER NOT NULL,
      nick TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT,
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
  existing.prepare(`
    INSERT INTO networks
      (id, name, host, port, tls, nick, username, password, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('network-1', 'Instance', 'irc.example.test', 6667, 0, 'tester', 'tester', null, now, now);
  existing.prepare(`
    INSERT INTO buffers
      (id, networkId, kind, target, unread, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('buffer-1', 'network-1', 'channel', '#help', 4, now, now);
  existing.prepare(`
    INSERT INTO channel_details
      (id, topic, users, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run('buffer-1', 'Topic', '["alice"]', now, now);
  existing.prepare(`
    INSERT INTO messages
      (id, networkId, target, nick, body, kind, self, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('message-1', 'network-1', '#help', 'alice', 'old stripped message', 'line', 0, now);
  existing.close();
};

const readBackupMessageCount = (dir: string) => {
  const backupDir = join(dir, 'backups');
  const backupFiles = readdirSync(backupDir)
    .filter((name) => name.includes(`pre-migration-v0-to-v${currentStorageSchemaVersion}`) && name.endsWith('.sqlite'));
  assert.equal(backupFiles.length, 1);

  const backup = openSqliteDatabase(join(backupDir, backupFiles[0]!));
  const count = backup.prepare('SELECT COUNT(*) AS count FROM messages').get() as { count: number };
  backup.close();
  return count.count;
};
