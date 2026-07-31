import type { SqliteDb } from './storage-sqlite.js';
import { ensureQueryPeerIdentityStorage } from './storage-query-identities.js';
import {
  ensureIdentityIndexes,
  ensureNickEmojiTable,
} from './storage-identity-migration.js';
import {
  dropLegacyMessageSearchArtifacts,
  ensureMessageSearchArtifacts,
} from './storage-schema-helpers.js';
import { storageBootstrapSchemaSql } from './storage-bootstrap-schema.js';
import {
  ensureCurrentBufferColumns,
  ensureCurrentMessageColumns,
  ensureCurrentNetworkColumns,
  type StorageMigrationContext,
} from './storage-migration-helpers.js';
import { storageMigrations } from './storage-migration-list.js';
import { userStateStorageSchemaVersion } from './storage-user-state-schema.js';

export const currentStorageSchemaVersion = userStateStorageSchemaVersion;

export const bootstrapStorageSchema = (db: SqliteDb) => db.exec(storageBootstrapSchemaSql);

export const applyStorageMigrations = (db: SqliteDb, context: StorageMigrationContext) => {
  let version = getUserVersion(db);
  if (!context.existedBeforeOpen && version === 0) {
    setUserVersion(db, currentStorageSchemaVersion);
    version = currentStorageSchemaVersion;
  } else {
    for (const migration of storageMigrations) {
      if (version >= migration.version) {
        continue;
      }
      migration.apply(db, context);
      setUserVersion(db, migration.version);
      version = migration.version;
    }
  }
  ensureCurrentNetworkColumns(db);
  ensureCurrentBufferColumns(db);
  ensureCurrentMessageColumns(db);
  ensureNickEmojiTable(db);
  ensureQueryPeerIdentityStorage(db);
  ensureIdentityIndexes(db);
  dropLegacyMessageSearchArtifacts(db);
  ensureMessageSearchArtifacts(db);
};

const getUserVersion = (db: SqliteDb) =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);

const setUserVersion = (db: SqliteDb, version: number) => db.exec(`PRAGMA user_version = ${version}`);
