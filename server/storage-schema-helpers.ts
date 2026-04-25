import type { SqliteDb } from './storage-sqlite.js';

export const historyImportBatchesSchemaSql = `
  CREATE TABLE IF NOT EXISTS history_import_batches (
    id TEXT PRIMARY KEY,
    bufferId TEXT NOT NULL REFERENCES buffers(id) ON DELETE CASCADE,
    selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );
`;

export const queryNickAliasesSchemaSql = `
  CREATE TABLE IF NOT EXISTS query_nick_aliases (
    bufferId TEXT NOT NULL REFERENCES buffers(id) ON DELETE CASCADE,
    networkId TEXT NOT NULL,
    nick TEXT NOT NULL,
    nickKey TEXT NOT NULL,
    firstSeenAt INTEGER NOT NULL,
    lastSeenAt INTEGER NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY (bufferId, nickKey)
  );

  CREATE INDEX IF NOT EXISTS idx_query_nick_aliases_network_nick
    ON query_nick_aliases(networkId, nickKey, bufferId);
`;

export const ensureHistoryImportBatchesTable = (db: SqliteDb) => {
  db.exec(historyImportBatchesSchemaSql);
};

export const ensureQueryNickAliasesTable = (db: SqliteDb) => {
  db.exec(queryNickAliasesSchemaSql);
};

export const dropLegacyMessageSearchArtifacts = (db: SqliteDb) => {
  db.exec(`
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TABLE IF EXISTS messages_fts;
  `);
};
