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
import { identityFromNick } from '../shared/user-identity.js';

export const currentStorageSchemaVersion = 24;

type StorageMigrationContext = {
  existedBeforeOpen: boolean;
};

type StorageMigration = {
  version: number;
  apply(db: SqliteDb, context: StorageMigrationContext): void;
};

const noopMigration = () => {};

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
  { version: 5, apply: noopMigration },
  { version: 6, apply: noopMigration },
  { version: 7, apply: noopMigration },
  { version: 8, apply: noopMigration },
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
  { version: 13, apply: noopMigration },
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
  {
    version: 22,
    apply: (db) => {
      ensureNickEmojiTable(db);
    },
  },
  {
    version: 23,
    apply: (db) => {
      dropColumnIfPresent(db, 'networks', 'username');
    },
  },
  {
    version: 24,
    apply: (db) => {
      migrateIdentityScopedTables(db);
      ensureColumn(db, 'messages', 'senderIdentityKind', 'TEXT');
      ensureColumn(db, 'messages', 'senderIdentityValue', 'TEXT');
    },
  },
];

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
  ensureNickEmojiTable(db);
  ensureIdentityIndexes(db);
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

const dropColumnIfPresent = (db: SqliteDb, table: string, column: string) => {
  if (tableHasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
};

const ensureCurrentNetworkColumns = (db: SqliteDb) => {
  ensureColumn(db, 'networks', 'workspaceOpen', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'networks', 'notes', "TEXT NOT NULL DEFAULT ''");
};

const ensureCurrentBufferColumns = (db: SqliteDb) => {
  ensureColumn(db, 'buffers', 'notes', "TEXT NOT NULL DEFAULT ''");
};

const ensureNickEmojiTable = (db: SqliteDb) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nick_emoji_tags (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
      nick TEXT NOT NULL COLLATE NOCASE,
      identityKind TEXT NOT NULL DEFAULT 'nick',
      identityValue TEXT NOT NULL,
      emoji TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(networkId, identityKind, identityValue)
    );
    CREATE INDEX IF NOT EXISTS idx_nick_emoji_tags_network_nick
      ON nick_emoji_tags(networkId, nick COLLATE NOCASE, createdAt ASC);
  `);
};

const ensureIdentityIndexes = (db: SqliteDb) => {
  if (tableHasColumn(db, 'muted_nicks', 'identityKind') && tableHasColumn(db, 'muted_nicks', 'identityValue')) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_muted_nicks_network_identity
        ON muted_nicks(networkId, identityKind, identityValue, createdAt ASC);
    `);
  }
  if (
    tableHasColumn(db, 'nick_emoji_tags', 'identityKind')
    && tableHasColumn(db, 'nick_emoji_tags', 'identityValue')
  ) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nick_emoji_tags_network_identity
        ON nick_emoji_tags(networkId, identityKind, identityValue, createdAt ASC);
    `);
  }
};

const migrateIdentityScopedTables = (db: SqliteDb) => {
  migrateIdentityScopedMutedNicks(db);
  migrateIdentityScopedNickEmojis(db);
};

const migrateIdentityScopedMutedNicks = (db: SqliteDb) => {
  if (!tableExists(db, 'muted_nicks')) {
    return;
  }
  db.exec(`
    CREATE TABLE muted_nicks_next (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
      nick TEXT NOT NULL COLLATE NOCASE,
      identityKind TEXT NOT NULL DEFAULT 'nick',
      identityValue TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(networkId, identityKind, identityValue)
    );
  `);
  const insert = db.prepare(`
    INSERT INTO muted_nicks_next
      (id, networkId, nick, identityKind, identityValue, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(networkId, identityKind, identityValue) DO UPDATE SET
      nick = excluded.nick,
      createdAt = min(createdAt, excluded.createdAt),
      updatedAt = max(updatedAt, excluded.updatedAt)
  `);
  const rows = db.prepare(`
    SELECT id, networkId, nick, createdAt, updatedAt
    FROM muted_nicks
    ORDER BY createdAt ASC
  `).all() as Array<{
    id: string;
    networkId: string;
    nick: string;
    createdAt: number;
    updatedAt: number;
  }>;
  for (const row of rows) {
    const identity = identityFromNick(row.nick);
    insert.run(row.id, row.networkId, row.nick, identity.kind, identity.value, row.createdAt, row.updatedAt);
  }
  db.exec(`
    DROP TABLE muted_nicks;
    ALTER TABLE muted_nicks_next RENAME TO muted_nicks;
    CREATE INDEX IF NOT EXISTS idx_muted_nicks_network_nick
      ON muted_nicks(networkId, nick COLLATE NOCASE, createdAt ASC);
    CREATE INDEX IF NOT EXISTS idx_muted_nicks_network_identity
      ON muted_nicks(networkId, identityKind, identityValue, createdAt ASC);
  `);
};

const migrateIdentityScopedNickEmojis = (db: SqliteDb) => {
  if (!tableExists(db, 'nick_emoji_tags')) {
    ensureNickEmojiTable(db);
    return;
  }
  db.exec(`
    CREATE TABLE nick_emoji_tags_next (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
      nick TEXT NOT NULL COLLATE NOCASE,
      identityKind TEXT NOT NULL DEFAULT 'nick',
      identityValue TEXT NOT NULL,
      emoji TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      UNIQUE(networkId, identityKind, identityValue)
    );
  `);
  const insert = db.prepare(`
    INSERT INTO nick_emoji_tags_next
      (id, networkId, nick, identityKind, identityValue, emoji, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(networkId, identityKind, identityValue) DO UPDATE SET
      nick = excluded.nick,
      emoji = excluded.emoji,
      createdAt = min(createdAt, excluded.createdAt),
      updatedAt = max(updatedAt, excluded.updatedAt)
  `);
  const rows = db.prepare(`
    SELECT id, networkId, nick, emoji, createdAt, updatedAt
    FROM nick_emoji_tags
    ORDER BY updatedAt ASC, createdAt ASC
  `).all() as Array<{
    id: string;
    networkId: string;
    nick: string;
    emoji: string;
    createdAt: number;
    updatedAt: number;
  }>;
  for (const row of rows) {
    const identity = identityFromNick(row.nick);
    insert.run(row.id, row.networkId, row.nick, identity.kind, identity.value, row.emoji, row.createdAt, row.updatedAt);
  }
  db.exec(`
    DROP TABLE nick_emoji_tags;
    ALTER TABLE nick_emoji_tags_next RENAME TO nick_emoji_tags;
    CREATE INDEX IF NOT EXISTS idx_nick_emoji_tags_network_nick
      ON nick_emoji_tags(networkId, nick COLLATE NOCASE, createdAt ASC);
    CREATE INDEX IF NOT EXISTS idx_nick_emoji_tags_network_identity
      ON nick_emoji_tags(networkId, identityKind, identityValue, createdAt ASC);
  `);
};

const getUserVersion = (db: SqliteDb) =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);

const setUserVersion = (db: SqliteDb, version: number) => db.exec(`PRAGMA user_version = ${version}`);
