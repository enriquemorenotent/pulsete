import { storageBootstrapSchemaSql } from './storage-bootstrap-schema.js';
import { dropLegacyMessageSearchArtifacts } from './storage-schema-helpers.js';
import type { SqliteDb } from './storage-sqlite.js';
import { migrateWorkspaceData } from './storage-workspace-migration-core.js';
import { createWorkspaceMigrationTablesSql } from './storage-workspace-migration-sql.js';

export const migrateWorkspaceNetworks = (db: SqliteDb) => {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    dropScratch(db);
    dropLegacyMessageSearchArtifacts(db);
    ensureLegacyWorkspaceColumns(db);
    db.exec(createWorkspaceMigrationTablesSql);
    migrateWorkspaceData(db);
    swapTables(db);
    db.exec(storageBootstrapSchemaSql);
    dropLegacyMessageSearchArtifacts(db);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures after a migration error.
    }
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
};

const ensureLegacyWorkspaceColumns = (db: SqliteDb) => {
  ensureColumn(db, 'templateId', 'TEXT');
  ensureColumn(db, 'managerHidden', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'connectionClosed', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'username', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'iconUrl', "TEXT NOT NULL DEFAULT ''");
};

const ensureColumn = (db: SqliteDb, column: string, definition: string) => {
  const columns = db.prepare('PRAGMA table_info(networks)').all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE networks ADD COLUMN ${column} ${definition}`);
  }
};

const swapTables = (db: SqliteDb) => {
  db.exec(`
    DROP TABLE IF EXISTS muted_nicks;
    DROP TABLE IF EXISTS query_nick_aliases;
    DROP TABLE IF EXISTS history_import_batches;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS channel_details;
    DROP TABLE IF EXISTS buffer_self_nick_aliases;
    DROP TABLE IF EXISTS buffers;
    DROP TABLE IF EXISTS network_auto_join_channels;
    DROP TABLE IF EXISTS network_historical_self_nicks;
    DROP TABLE IF EXISTS network_alt_nicks;
    DROP TABLE IF EXISTS networks;
    ALTER TABLE networks_next RENAME TO networks;
    ALTER TABLE network_alt_nicks_next RENAME TO network_alt_nicks;
    ALTER TABLE network_historical_self_nicks_next RENAME TO network_historical_self_nicks;
    ALTER TABLE network_auto_join_channels_next RENAME TO network_auto_join_channels;
    ALTER TABLE buffers_next RENAME TO buffers;
    ALTER TABLE buffer_self_nick_aliases_next RENAME TO buffer_self_nick_aliases;
    ALTER TABLE channel_details_next RENAME TO channel_details;
    ALTER TABLE messages_next RENAME TO messages;
    ALTER TABLE history_import_batches_next RENAME TO history_import_batches;
    ALTER TABLE query_nick_aliases_next RENAME TO query_nick_aliases;
    ALTER TABLE muted_nicks_next RENAME TO muted_nicks;
  `);
  dropScratch(db);
};

const dropScratch = (db: SqliteDb) => {
  db.exec(`
    DROP TABLE IF EXISTS muted_nicks_next;
    DROP TABLE IF EXISTS query_nick_aliases_next;
    DROP TABLE IF EXISTS history_import_batches_next;
    DROP TABLE IF EXISTS messages_next;
    DROP TABLE IF EXISTS channel_details_next;
    DROP TABLE IF EXISTS buffer_self_nick_aliases_next;
    DROP TABLE IF EXISTS buffers_next;
    DROP TABLE IF EXISTS network_auto_join_channels_next;
    DROP TABLE IF EXISTS network_historical_self_nicks_next;
    DROP TABLE IF EXISTS network_alt_nicks_next;
    DROP TABLE IF EXISTS networks_next;
  `);
};
