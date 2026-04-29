import type { SqliteDb } from './storage-sqlite.js';
import { backfillQueryBufferSelfNickAliases } from './storage-migration-alias-backfill.js';
import { migrateNormalizedStorage } from './storage-normalized-migration.js';
import { migrateQueryNickAliases } from './storage-query-alias-migration.js';
import { migrateWorkspaceNetworks } from './storage-workspace-migration.js';
import {
  dropLegacyMessageSearchArtifacts,
  ensureHistoryImportBatchesTable,
  ensureMessageSearchArtifacts,
} from './storage-schema-helpers.js';
import { storageBootstrapSchemaSql } from './storage-bootstrap-schema.js';

export const currentStorageSchemaVersion = 21;

type StorageMigrationContext = {
  existedBeforeOpen: boolean;
};

type StorageMigration = {
  version: number;
  apply(db: SqliteDb, context: StorageMigrationContext): void;
};

const storageMigrations: readonly StorageMigration[] = [
  {
    version: 1,
    apply: (db) => {
      ensureColumn(db, 'networks', 'autoJoin', "TEXT NOT NULL DEFAULT '[]'");
      ensureColumn(db, 'networks', 'altNicks', "TEXT NOT NULL DEFAULT '[]'");
      ensureColumn(db, 'networks', 'realName', "TEXT NOT NULL DEFAULT ''");
      ensureColumn(db, 'networks', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 2,
    apply: (db) => {
      ensureColumn(db, 'networks', 'templateId', 'TEXT');
      ensureColumn(db, 'networks', 'managerHidden', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 3,
    apply: (db) => {
      ensureColumn(db, 'networks', 'authMethod', "TEXT NOT NULL DEFAULT 'none'");
      ensureColumn(db, 'networks', 'authTarget', "TEXT NOT NULL DEFAULT 'NickServ'");
      db.exec("UPDATE networks SET authMethod = 'server-pass' WHERE password IS NOT NULL AND authMethod = 'none'");
      db.exec("UPDATE networks SET authTarget = 'NickServ' WHERE authTarget IS NULL OR authTarget = ''");
    },
  },
  {
    version: 4,
    apply: (db) => {
      ensureColumn(db, 'networks', 'authAccount', "TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    version: 5,
    apply: () => {},
  },
  {
    version: 6,
    apply: () => {},
  },
  {
    version: 7,
    apply: () => {},
  },
  {
    version: 8,
    apply: () => {},
  },
  {
    version: 9,
    apply: (db) => {
      ensureColumn(db, 'networks', 'historicalSelfNicks', "TEXT NOT NULL DEFAULT '[]'");
      ensureColumn(db, 'messages', 'speakerRole', "TEXT NOT NULL DEFAULT 'unknown'");
      ensureColumn(db, 'messages', 'speakerNick', 'TEXT');
      ensureColumn(db, 'messages', 'attributionSource', "TEXT NOT NULL DEFAULT 'unknown'");
      ensureColumn(db, 'messages', 'attributionConfidence', "TEXT NOT NULL DEFAULT 'low'");
      ensureColumn(db, 'messages', 'importBatchId', 'TEXT');
      ensureHistoryImportBatchesTable(db);
    },
  },
  {
    version: 10,
    apply: (db) => {
      ensureColumn(db, 'buffers', 'selfNickAliases', "TEXT NOT NULL DEFAULT '[]'");
      backfillQueryBufferSelfNickAliases(db);
    },
  },
  {
    version: 11,
    apply: (db) => {
      ensureColumn(db, 'buffers', 'priorityUnread', 'INTEGER NOT NULL DEFAULT 0');
      ensureColumn(db, 'buffers', 'lastReadTs', 'INTEGER');
      ensureColumn(db, 'buffers', 'lastReadMessageId', 'TEXT');
    },
  },
  {
    version: 12,
    apply: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS muted_nicks (
          id TEXT PRIMARY KEY,
          networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
          nick TEXT NOT NULL COLLATE NOCASE,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          UNIQUE(networkId, nick)
        );
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_muted_nicks_network_nick
          ON muted_nicks(networkId, nick COLLATE NOCASE, createdAt ASC);
      `);
    },
  },
  {
    version: 13,
    apply: () => {},
  },
  {
    version: 14,
    apply: (db) => {
      migrateNormalizedStorage(db, { tableExists, tableHasColumn });
    },
  },
  {
    version: 15,
    apply: (db) => {
      ensureColumn(db, 'networks', 'connectionClosed', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 16,
    apply: (db) => {
      migrateQueryNickAliases(db);
    },
  },
  {
    version: 17,
    apply: (db) => {
      migrateWorkspaceNetworks(db);
    },
  },
  {
    version: 18,
    apply: (db) => {
      dropLegacyMessageSearchArtifacts(db);
    },
  },
  {
    version: 19,
    apply: (db) => {
      ensureMessageSearchArtifacts(db, { backfill: true });
    },
  },
  {
    version: 20,
    apply: (db) => {
      ensureColumn(db, 'networks', 'notes', "TEXT NOT NULL DEFAULT ''");
    },
  },
  {
    version: 21,
    apply: (db) => {
      ensureColumn(db, 'buffers', 'notes', "TEXT NOT NULL DEFAULT ''");
    },
  },
];

export const bootstrapStorageSchema = (db: SqliteDb) => {
  db.exec(storageBootstrapSchemaSql);
};

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
  dropLegacyMessageSearchArtifacts(db);
  ensureMessageSearchArtifacts(db);
};

export const tableExists = (db: SqliteDb, table: string) =>
  Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table)
  );

export const tableHasColumn = (db: SqliteDb, table: string, column: string) =>
  tableExists(db, table)
  && (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .some((entry) => entry.name === column);

const ensureColumn = (db: SqliteDb, table: string, column: string, definition: string) => {
  if (!tableHasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
};

const ensureCurrentNetworkColumns = (db: SqliteDb) => {
  ensureColumn(db, 'networks', 'workspaceOpen', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'networks', 'notes', "TEXT NOT NULL DEFAULT ''");
};

const ensureCurrentBufferColumns = (db: SqliteDb) => {
  ensureColumn(db, 'buffers', 'notes', "TEXT NOT NULL DEFAULT ''");
};

const getUserVersion = (db: SqliteDb) =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);

const setUserVersion = (db: SqliteDb, version: number) => {
  db.exec(`PRAGMA user_version = ${version}`);
};
