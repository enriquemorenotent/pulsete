import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyStorageMigrations, bootstrapStorageSchema } from './storage-migrations.js';

export const createDatabase = (filePath = resolve('data', 'pulsete.sqlite')) => {
  mkdirSync(dirname(filePath), { recursive: true });
  backupLegacyDatabaseIfNeeded(filePath);
  const existedBeforeOpen = existsSync(filePath);
  const db = new DatabaseSync(filePath);
  bootstrapStorageSchema(db);
  applyStorageMigrations(db, { existedBeforeOpen });
  return db;
};

export const runInTransaction = <T>(db: DatabaseSync, task: () => T) => {
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

const backupLegacyDatabaseIfNeeded = (filePath: string) => {
  if (!existsSync(filePath)) {
    return;
  }
  const db = new DatabaseSync(filePath);
  const shouldBackup = hasLegacyAuthSchema(db);
  db.close();
  if (!shouldBackup) {
    return;
  }
  const suffix = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = `${filePath}.legacy-${suffix}`;
  renameIfExists(filePath, backupFilePath);
  renameIfExists(`${filePath}-wal`, `${backupFilePath}-wal`);
  renameIfExists(`${filePath}-shm`, `${backupFilePath}-shm`);
};

const hasLegacyAuthSchema = (db: DatabaseSync) =>
  tableExists(db, 'users') ||
  tableExists(db, 'sessions') ||
  tableHasColumn(db, 'networks', 'userId') ||
  tableHasColumn(db, 'channels', 'userId') ||
  tableHasColumn(db, 'queries', 'userId') ||
  tableHasColumn(db, 'messages', 'userId');

const tableExists = (db: DatabaseSync, table: string) =>
  Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table)
  );

const tableHasColumn = (db: DatabaseSync, table: string, column: string) =>
  tableExists(db, table) &&
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .some((entry) => entry.name === column);

const renameIfExists = (source: string, target: string) => {
  if (existsSync(source)) {
    renameSync(source, target);
  }
};
