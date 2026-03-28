import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyStorageMigrations, bootstrapStorageSchema } from './storage-migrations.js';

export const createDatabase = (filePath = resolve('data', 'pulsete.sqlite')) => {
  mkdirSync(dirname(filePath), { recursive: true });
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
