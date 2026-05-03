import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  applyStorageMigrations,
  bootstrapStorageSchema,
  currentStorageSchemaVersion,
} from './storage-migrations.js';
import { openSqliteDatabase, type SqliteDb } from './storage-sqlite.js';

export const createDatabase = (filePath: string, backupDirectory: string) => {
  filePath = resolve(filePath);
  mkdirSync(dirname(filePath), { recursive: true });
  const existedBeforeOpen = existsSync(filePath);
  const db = openSqliteDatabase(filePath);
  applyDatabasePragmas(db);
  const hasUserTables = databaseHasUserTables(db);
  if (!hasUserTables) {
    bootstrapStorageSchema(db);
  }
  const version = getDatabaseUserVersion(db);
  if (existedBeforeOpen && hasUserTables && version < currentStorageSchemaVersion) {
    createPreMigrationBackup(db, filePath, backupDirectory, version);
  }
  applyStorageMigrations(db, { existedBeforeOpen: existedBeforeOpen && hasUserTables });
  return db;
};

const applyDatabasePragmas = (db: SqliteDb) => {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
};

const databaseHasUserTables = (db: SqliteDb) =>
  Number(
    (
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
      `).get() as { count?: number } | undefined
    )?.count ?? 0
  ) > 0;

const getDatabaseUserVersion = (db: SqliteDb) =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);

const createPreMigrationBackup = (
  db: SqliteDb,
  filePath: string,
  backupDirectory: string,
  fromVersion: number
) => {
  db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
  const backupPath = preMigrationBackupPath(filePath, backupDirectory, fromVersion, new Date());
  mkdirSync(dirname(backupPath), { recursive: true });
  copyFileSync(filePath, backupPath);
  copySidecarIfPresent(`${filePath}-wal`, `${backupPath}-wal`);
  copySidecarIfPresent(`${filePath}-shm`, `${backupPath}-shm`);
};

const preMigrationBackupPath = (
  filePath: string,
  backupDirectory: string,
  fromVersion: number,
  date: Date
) => {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  const name = `${basename(filePath)}.pre-migration-v${fromVersion}-to-v${currentStorageSchemaVersion}-${timestamp}.sqlite`;
  return join(backupDirectory, name);
};

const copySidecarIfPresent = (source: string, destination: string) => {
  if (existsSync(source)) {
    copyFileSync(source, destination);
  }
};

export const runInTransaction = <T>(db: SqliteDb, task: () => T) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = task();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures after a task error.
    }
    throw error;
  }
};
