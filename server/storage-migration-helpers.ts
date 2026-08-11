import type { SqliteDb } from './storage-sqlite.js';
import { tableHasColumn } from './storage-schema-helpers.js';

export type StorageMigrationContext = {
  existedBeforeOpen: boolean;
};

export type StorageMigration = {
  version: number;
  apply(db: SqliteDb, context: StorageMigrationContext): void;
};

export const ensureColumn = (
  db: SqliteDb,
  table: string,
  column: string,
  definition: string,
) => {
  if (!tableHasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
};

export const ensureCurrentNetworkColumns = (db: SqliteDb) => {
  ensureColumn(db, 'networks', 'workspaceOpen', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'networks', 'username', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'networks', 'iconUrl', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'networks', 'notes', "TEXT NOT NULL DEFAULT ''");
};

export const ensureCurrentBufferColumns = (db: SqliteDb) => {
  ensureColumn(db, 'buffers', 'notes', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'buffers', 'ircCloudAvatarId', 'TEXT');
};

export const ensureCurrentMessageColumns = (db: SqliteDb) => {
  ensureColumn(db, 'messages', 'delivery', "TEXT NOT NULL DEFAULT 'live'");
  ensureColumn(db, 'messages', 'pinnedAt', 'INTEGER');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_buffer_pinned
      ON messages(bufferId, ts ASC)
      WHERE pinnedAt IS NOT NULL;
  `);
};
