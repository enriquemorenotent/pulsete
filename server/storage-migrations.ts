import type { SqliteDb } from './storage-sqlite.js';
import {
  storageBootstrapSchemaSql,
  storageBootstrapSchemaVersion,
} from './storage-bootstrap-schema.js';
import type { StorageMigrationContext } from './storage-migration-helpers.js';
import { storageMigrations } from './storage-migration-list.js';
import { repairStorageSchema } from './storage-schema-repair.js';

export const currentStorageSchemaVersion = storageMigrations[storageMigrations.length - 1]!.version;

export const applyStorageMigrations = (db: SqliteDb, context: StorageMigrationContext) => {
  if (!context.existedBeforeOpen) {
    // Commit the starting schema and its version together so an interrupted
    // first launch cannot leave modern tables labeled as a version-0 database.
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(storageBootstrapSchemaSql);
      setUserVersion(db, storageBootstrapSchemaVersion);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  let version = getStorageSchemaVersion(db);
  for (const migration of storageMigrations) {
    if (version >= migration.version) {
      continue;
    }
    migration.apply(db, context);
    setUserVersion(db, migration.version);
    version = migration.version;
  }

  if (context.existedBeforeOpen) {
    repairStorageSchema(db);
  }
};

export const getStorageSchemaVersion = (db: SqliteDb) =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);

const setUserVersion = (db: SqliteDb, version: number) => db.exec(`PRAGMA user_version = ${version}`);
