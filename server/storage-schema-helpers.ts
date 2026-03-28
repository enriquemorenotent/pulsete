import type { DatabaseSync } from 'node:sqlite';
import { defaultAssistantModel } from '../shared/assistant-defaults.js';

type EnsureColumn = (db: DatabaseSync, table: string, column: string, definition: string) => boolean;

export const assistantTablesSchemaSql = `
  CREATE TABLE IF NOT EXISTS assistant_threads (
    id TEXT PRIMARY KEY,
    bufferId TEXT,
    networkId TEXT,
    target TEXT,
    scope TEXT NOT NULL DEFAULT 'buffer',
    title TEXT NOT NULL,
    task TEXT NOT NULL,
    model TEXT NOT NULL,
    turnStatus TEXT,
    turnsJson TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assistant_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    defaultModel TEXT NOT NULL,
    activeThreadId TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_assistant_threads_updated
    ON assistant_threads(updatedAt DESC, createdAt DESC);
`;

export const historyImportBatchesSchemaSql = `
  CREATE TABLE IF NOT EXISTS history_import_batches (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    bufferId TEXT NOT NULL,
    target TEXT NOT NULL,
    selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );
`;

const messagesSearchIndexTableSql = `
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(
      messageId UNINDEXED,
      networkId UNINDEXED,
      target UNINDEXED,
      nick,
      body,
      tokenize = 'porter unicode61'
    );
`;

const messagesSearchIndexTriggersSql = (clause = '') => `
  CREATE TRIGGER ${clause}messages_ai
    AFTER INSERT ON messages
  BEGIN
    INSERT INTO messages_fts (rowid, messageId, networkId, target, nick, body)
    VALUES (new.rowid, new.id, new.networkId, new.target, coalesce(new.nick, ''), new.body);
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
    INSERT INTO messages_fts (rowid, messageId, networkId, target, nick, body)
    VALUES (new.rowid, new.id, new.networkId, new.target, coalesce(new.nick, ''), new.body);
  END;
`;

export const messagesSearchIndexSchemaSql = `
${messagesSearchIndexTableSql}
${messagesSearchIndexTriggersSql('IF NOT EXISTS ')}
`;

export const ensureAssistantTables = (db: DatabaseSync, ensureColumn: EnsureColumn) => {
  db.exec(assistantTablesSchemaSql);
  ensureColumn(db, 'assistant_threads', 'turnsJson', "TEXT NOT NULL DEFAULT '[]'");
  ensureAssistantThreadScope(db, ensureColumn);
  const count = db.prepare('SELECT COUNT(*) AS count FROM assistant_preferences').get() as { count?: number } | undefined;
  if ((count?.count ?? 0) > 0) {
    return;
  }
  const now = Date.now();
  db.prepare(`
    INSERT INTO assistant_preferences (id, defaultModel, activeThreadId, createdAt, updatedAt)
    VALUES (1, ?, NULL, ?, ?)
  `).run(defaultAssistantModel, now, now);
};

export const ensureAssistantThreadScope = (db: DatabaseSync, ensureColumn: EnsureColumn) => {
  ensureColumn(db, 'assistant_threads', 'scope', "TEXT NOT NULL DEFAULT 'buffer'");
  db.exec(`
    UPDATE assistant_threads
    SET scope = CASE
      WHEN bufferId IS NULL THEN 'free'
      ELSE 'buffer'
    END
    WHERE scope IS NULL OR scope = '' OR (bufferId IS NULL AND scope = 'buffer')
  `);
};

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
    INSERT INTO messages_fts (rowid, messageId, networkId, target, nick, body)
    SELECT rowid, id, networkId, target, coalesce(nick, ''), body
    FROM messages
  `);
};
