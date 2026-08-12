import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHttpHandler } from '../server/http-router.js';
import { RuntimeHost } from '../server/runtime-host.js';
import { currentStorageSchemaVersion } from '../server/storage-migrations.js';
import { openSqliteDatabase, type SqliteDb } from '../server/storage-sqlite.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { listen } from './helpers/http-request-helpers.js';

type BackupEnvelope = {
  database: string;
  secret: string | null;
  storageSchemaVersion: number;
};

test('backup import rejects a current database with missing columns before replacement', async () => {
  const context = await createBackupServer();
  try {
    const backup = createDamagedBackup(context, (db) => {
      db.exec('ALTER TABLE networks DROP COLUMN host');
    });

    await assertRejectedImportPreservesRuntime(context, backup, 400);
  } finally {
    await context.close();
  }
});

test('backup import rejects invalid relational data before replacement', async () => {
  const context = await createBackupServer();
  try {
    const backup = createDamagedBackup(context, (db) => {
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare(`INSERT INTO buffers
        (id, networkId, kind, target, targetKey, isOpen, unread, priorityUnread,
         lastReadTs, lastReadMessageId, notes, ircCloudAvatarId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('orphan-buffer', 'missing-network', 'query', 'Ghost', 'ghost', 1, 0, 0,
          null, null, '', null, 1, 1);
    });

    await assertRejectedImportPreservesRuntime(context, backup, 400);
  } finally {
    await context.close();
  }
});

test('backup import rejects migration failures before replacement', async () => {
  const context = await createBackupServer();
  try {
    const backup = createDamagedBackup(context, (db, envelope) => {
      db.exec(`
        DROP TRIGGER IF EXISTS message_search_ai;
        DROP TRIGGER IF EXISTS message_search_ad;
        DROP TRIGGER IF EXISTS message_search_au;
        DROP TABLE message_search_fts;
        DROP TABLE messages;
        CREATE VIRTUAL TABLE messages USING fts5(id, bufferId, networkId, target, body);
        PRAGMA user_version = 30;
      `);
      envelope.storageSchemaVersion = 30;
    });

    await assertRejectedImportPreservesRuntime(context, backup, 400);
  } finally {
    await context.close();
  }
});

test('backup import migrates a valid older candidate before replacement', async () => {
  const context = await createBackupServer();
  try {
    const backup = createDamagedBackup(context, (db, envelope) => {
      db.exec(`
        DROP INDEX IF EXISTS idx_messages_buffer_pinned;
        ALTER TABLE messages DROP COLUMN pinnedAt;
        PRAGMA user_version = 30;
      `);
      envelope.storageSchemaVersion = 30;
    });

    const response = await importBackup(context, backup);
    const db = openSqliteDatabase(context.host.currentStorage().databasePath);
    try {
      const version = db.prepare('PRAGMA user_version').get() as { user_version?: number };
      assert.equal(response.status, 200);
      assert.equal(version.user_version, currentStorageSchemaVersion);
      assert.equal(context.host.currentStorage().networks.list()[0]?.name, 'OriginalNet');
    } finally {
      db.close();
    }
  } finally {
    await context.close();
  }
});

test('backup import rejects snapshots with invalid app data before replacement', async () => {
  const context = await createBackupServer();
  try {
    const backup = createDamagedBackup(context, (db) => {
      db.exec('UPDATE networks SET port = 0, workspaceOpen = 1');
    });

    await assertRejectedImportPreservesRuntime(context, backup, 400);
  } finally {
    await context.close();
  }
});

test('backup import rejects a mismatched encryption secret before replacement', async () => {
  const context = await createBackupServer();
  try {
    const backup = createDamagedBackup(context, (_db, envelope) => {
      envelope.secret = Buffer.alloc(32, 7).toString('base64');
    });

    await assertRejectedImportPreservesRuntime(context, backup, 400);
  } finally {
    await context.close();
  }
});

test('backup import restores the original database when replacement startup fails', async () => {
  const context = await createBackupServer();
  try {
    const backup = createDamagedBackup(context, (db) => {
      db.exec(`
        CREATE TABLE restore_open_counter (value INTEGER NOT NULL);
        INSERT INTO restore_open_counter (value) VALUES (0);
        CREATE TRIGGER fail_second_restore_open
        BEFORE INSERT ON workspace_preferences
        BEGIN
          UPDATE restore_open_counter SET value = value + 1;
          SELECT CASE WHEN (SELECT value FROM restore_open_counter) > 1
            THEN RAISE(ABORT, 'forced replacement startup failure')
          END;
        END;
      `);
    });

    await assertRejectedImportPreservesRuntime(context, backup, 500);
  } finally {
    await context.close();
  }
});

const assertRejectedImportPreservesRuntime = async (
  context: Awaited<ReturnType<typeof createBackupServer>>,
  backup: Buffer,
  expectedStatus: number,
) => {
  const response = await importBackup(context, backup);

  assert.equal(response.status, expectedStatus);
  assert.equal(context.host.currentStorage().networks.list()[0]?.name, 'OriginalNet');
  context.host.currentStorage().networks.upsert(createNetworkInput({ name: 'StillUsableNet' }));
  assert.deepEqual(
    context.host.currentStorage().networks.list().map((network) => network.name),
    ['OriginalNet', 'StillUsableNet'],
  );
};

const importBackup = (
  context: Awaited<ReturnType<typeof createBackupServer>>,
  backup: Buffer,
) => fetch(`http://127.0.0.1:${context.port}/api/backups/import`, {
  method: 'POST',
  body: Buffer.from(backup),
});

const createDamagedBackup = (
  context: Awaited<ReturnType<typeof createBackupServer>>,
  mutate: (db: SqliteDb, envelope: BackupEnvelope) => void,
) => {
  const backup = context.host.currentStorage().exportBackup({}).content;
  const envelope = JSON.parse(gunzipSync(backup).toString('utf8')) as BackupEnvelope;
  const databasePath = join(context.dir, 'candidate.sqlite');
  writeFileSync(databasePath, Buffer.from(envelope.database, 'base64'));
  const db = openSqliteDatabase(databasePath);
  try {
    mutate(db, envelope);
  } finally {
    db.close();
  }
  envelope.database = readFileSync(databasePath).toString('base64');
  return gzipSync(Buffer.from(JSON.stringify(envelope)));
};

const createBackupServer = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-backup-security-'));
  const host = new RuntimeHost(join(dir, 'db.sqlite'));
  host.currentStorage().networks.upsert(createNetworkInput({
    authMethod: 'server-pass',
    name: 'OriginalNet',
    password: 'original-secret',
  }));
  const server = createServer(createHttpHandler(host.http));
  attachWebSocketServer(server, host.ws);
  server.on('close', () => host.close());
  const port = await listen(server);
  const close = () => new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())));
  return { close, dir, host, port };
};
