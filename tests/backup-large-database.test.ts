import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { RuntimeHost } from '../server/runtime-host.js';
import { openSqliteDatabase } from '../server/storage-sqlite.js';

test('a database larger than the old base64 string limit exports and restores', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulsete-large-backup-'));
  const source = new RuntimeHost(join(directory, 'source.sqlite'));
  const target = new RuntimeHost(join(directory, 'target', 'db.sqlite'));
  const bytes = 400 * 1024 * 1024;
  try {
    const db = openSqliteDatabase(source.currentStorage().databasePath);
    try {
      db.exec('CREATE TABLE large_backup_fixture (id INTEGER PRIMARY KEY, payload BLOB)');
      db.prepare('INSERT INTO large_backup_fixture VALUES (1, zeroblob(?))').run(bytes);
    } finally {
      db.close();
    }
    const backup = source.http.backups.export({});
    target.http.backups.import(backup.content);
    const restored = openSqliteDatabase(target.currentStorage().databasePath);
    try {
      assert.deepEqual(restored.prepare(
        'SELECT id, length(payload) AS bytes, hex(substr(payload, -1)) AS lastByte FROM large_backup_fixture',
      ).get(), { id: 1, bytes, lastByte: '00' });
      assert.deepEqual(restored.prepare('PRAGMA integrity_check').get(), { integrity_check: 'ok' });
    } finally {
      restored.close();
    }
  } finally {
    source.close();
    target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
