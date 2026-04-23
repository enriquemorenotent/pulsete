import type { DatabaseSync } from 'node:sqlite';

export const historyImportBatchesSchemaSql = `
  CREATE TABLE IF NOT EXISTS history_import_batches (
    id TEXT PRIMARY KEY,
    bufferId TEXT NOT NULL REFERENCES buffers(id) ON DELETE CASCADE,
    selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );
`;

const messagesSearchIndexTableSql = `
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(
      messageId UNINDEXED,
      bufferId UNINDEXED,
      nick,
      body,
      tokenize = 'porter unicode61'
    );
`;

const messagesSearchIndexTriggersSql = (clause = '') => `
  CREATE TRIGGER ${clause}messages_ai
    AFTER INSERT ON messages
  BEGIN
    INSERT INTO messages_fts (rowid, messageId, bufferId, nick, body)
    VALUES (new.rowid, new.id, new.bufferId, coalesce(new.nick, ''), new.body);
  END;

  CREATE TRIGGER ${clause}messages_ad
    AFTER DELETE ON messages
  BEGIN
    DELETE FROM messages_fts WHERE rowid = old.rowid;
  END;

  CREATE TRIGGER ${clause}messages_au
    AFTER UPDATE ON messages
  BEGIN
    DELETE FROM messages_fts WHERE rowid = old.rowid;
    INSERT INTO messages_fts (rowid, messageId, bufferId, nick, body)
    VALUES (new.rowid, new.id, new.bufferId, coalesce(new.nick, ''), new.body);
  END;
`;

export const ensureHistoryImportBatchesTable = (db: DatabaseSync) => {
  db.exec(historyImportBatchesSchemaSql);
};

export const ensureMessagesSearchIndex = (
  db: DatabaseSync,
  forceRebuild: boolean,
  tableExists: (db: DatabaseSync, table: string) => boolean,
) => {
  const hadIndex = tableExists(db, 'messages_fts');
  db.exec(messagesSearchIndexTableSql);
  db.exec('DROP TRIGGER IF EXISTS messages_ai');
  db.exec('DROP TRIGGER IF EXISTS messages_ad');
  db.exec('DROP TRIGGER IF EXISTS messages_au');
  db.exec(messagesSearchIndexTriggersSql());
  if (forceRebuild || !hadIndex || messagesSearchIndexNeedsRebuild(db, tableExists)) {
    rebuildMessagesSearchIndex(db);
  }
};

const messagesSearchIndexNeedsRebuild = (
  db: DatabaseSync,
  tableExists: (db: DatabaseSync, table: string) => boolean,
) => {
  if (!tableExists(db, 'messages') || !tableExists(db, 'messages_fts')) {
    return false;
  }
  const messageCount = Number((db.prepare('SELECT COUNT(*) AS count FROM messages').get() as { count?: number } | undefined)?.count ?? 0);
  const indexCount = Number((db.prepare('SELECT COUNT(*) AS count FROM messages_fts').get() as { count?: number } | undefined)?.count ?? 0);
  return messageCount !== indexCount;
};

const rebuildMessagesSearchIndex = (db: DatabaseSync) => {
  db.exec('DELETE FROM messages_fts');
  db.exec(`
    INSERT INTO messages_fts (rowid, messageId, bufferId, nick, body)
    SELECT rowid, id, bufferId, coalesce(nick, ''), body
    FROM messages
  `);
};
