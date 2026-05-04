import type { SqliteDb } from './storage-sqlite.js';

export const tableExists = (db: SqliteDb, table: string) =>
  Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table)
  );

export const tableHasColumn = (db: SqliteDb, table: string, column: string) =>
  tableExists(db, table)
  && (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .some((entry) => entry.name === column);

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

export const messageSearchSchemaSql = `
  CREATE VIRTUAL TABLE IF NOT EXISTS message_search_fts USING fts5(
    messageId UNINDEXED,
    bufferId UNINDEXED,
    body,
    nick,
    speakerNick,
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS message_search_ai AFTER INSERT ON messages BEGIN
    INSERT OR REPLACE INTO message_search_fts
      (rowid, messageId, bufferId, body, nick, speakerNick)
    VALUES (
      new.rowid,
      new.id,
      new.bufferId,
      coalesce(new.body, ''),
      coalesce(new.nick, ''),
      coalesce(new.speakerNick, '')
    );
  END;

  CREATE TRIGGER IF NOT EXISTS message_search_ad AFTER DELETE ON messages BEGIN
    DELETE FROM message_search_fts WHERE rowid = old.rowid;
  END;

  CREATE TRIGGER IF NOT EXISTS message_search_au AFTER UPDATE ON messages BEGIN
    DELETE FROM message_search_fts WHERE rowid = old.rowid;
    INSERT OR REPLACE INTO message_search_fts
      (rowid, messageId, bufferId, body, nick, speakerNick)
    VALUES (
      new.rowid,
      new.id,
      new.bufferId,
      coalesce(new.body, ''),
      coalesce(new.nick, ''),
      coalesce(new.speakerNick, '')
    );
  END;
`;

export const ensureHistoryImportBatchesTable = (db: SqliteDb) => {
  db.exec(historyImportBatchesSchemaSql);
};

export const ensureQueryNickAliasesTable = (db: SqliteDb) => {
  db.exec(queryNickAliasesSchemaSql);
};

export const ensureMessageSearchArtifacts = (db: SqliteDb, options: { backfill?: boolean } = {}) => {
  const hadSearchIndex = messageSearchIndexExists(db);
  db.exec(messageSearchSchemaSql);
  if (options.backfill || !hadSearchIndex) {
    backfillMessageSearchIndex(db);
  }
};

export const backfillMessageSearchIndex = (db: SqliteDb) => {
  db.exec(`
    INSERT OR REPLACE INTO message_search_fts
      (rowid, messageId, bufferId, body, nick, speakerNick)
    SELECT
      rowid,
      id,
      bufferId,
      coalesce(body, ''),
      coalesce(nick, ''),
      coalesce(speakerNick, '')
    FROM messages;
  `);
};

export const dropLegacyMessageSearchArtifacts = (db: SqliteDb) => {
  db.exec(`
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TRIGGER IF EXISTS messages_ad;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TABLE IF EXISTS messages_fts;
  `);
};

const messageSearchIndexExists = (db: SqliteDb) => tableExists(db, 'message_search_fts');
