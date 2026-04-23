import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyStorageMigrations, bootstrapStorageSchema } from './storage-migrations.js';

export const createDatabase = (filePath = resolve('data', 'pulsete.sqlite')) => {
  mkdirSync(dirname(filePath), { recursive: true });
  const existedBeforeOpen = existsSync(filePath);
  const db = new DatabaseSync(filePath);
  applyDatabasePragmas(db);
  const hasUserTables = databaseHasUserTables(db);
  if (!hasUserTables) {
    bootstrapStorageSchema(db);
  }
  applyStorageMigrations(db, { existedBeforeOpen: existedBeforeOpen && hasUserTables });
  return db;
};

const applyDatabasePragmas = (db: DatabaseSync) => {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
};

const databaseHasUserTables = (db: DatabaseSync) =>
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
