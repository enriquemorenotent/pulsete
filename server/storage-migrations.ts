import type { DatabaseSync } from 'node:sqlite';
import { defaultAssistantModel } from '../shared/assistant-defaults.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';

export const currentStorageSchemaVersion = 11;

const schemaSql = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS networks (
    id TEXT PRIMARY KEY,
    templateId TEXT,
    managerHidden INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    tls INTEGER NOT NULL,
    nick TEXT NOT NULL,
    altNicks TEXT NOT NULL DEFAULT '[]',
    historicalSelfNicks TEXT NOT NULL DEFAULT '[]',
    username TEXT NOT NULL,
    realName TEXT NOT NULL DEFAULT '',
    password TEXT,
    authMethod TEXT NOT NULL DEFAULT 'none',
    authTarget TEXT NOT NULL DEFAULT 'NickServ',
    authAccount TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    autoJoin TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS buffers (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    unread INTEGER NOT NULL DEFAULT 0,
    priorityUnread INTEGER NOT NULL DEFAULT 0,
    lastReadTs INTEGER,
    lastReadMessageId TEXT,
    selfNickAliases TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(networkId, target)
  );

  CREATE TABLE IF NOT EXISTS channel_details (
    id TEXT PRIMARY KEY REFERENCES buffers(id) ON DELETE CASCADE,
    topic TEXT NOT NULL DEFAULT '',
    users TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    nick TEXT,
    speakerRole TEXT NOT NULL DEFAULT 'unknown',
    speakerNick TEXT,
    attributionSource TEXT NOT NULL DEFAULT 'unknown',
    attributionConfidence TEXT NOT NULL DEFAULT 'low',
    importBatchId TEXT,
    body TEXT NOT NULL,
    kind TEXT NOT NULL,
    self INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history_import_batches (
    id TEXT PRIMARY KEY,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    bufferId TEXT NOT NULL,
    target TEXT NOT NULL,
    selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    nick TEXT NOT NULL COLLATE NOCASE UNIQUE,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

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

  CREATE INDEX IF NOT EXISTS idx_messages_buffer
    ON messages(networkId, target, ts DESC);

  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
    USING fts5(
      messageId UNINDEXED,
      networkId UNINDEXED,
      target UNINDEXED,
      nick,
      body,
      tokenize = 'porter unicode61'
    );

  CREATE TRIGGER IF NOT EXISTS messages_ai
    AFTER INSERT ON messages
  BEGIN
    INSERT INTO messages_fts (rowid, messageId, networkId, target, nick, body)
    VALUES (new.rowid, new.id, new.networkId, new.target, coalesce(new.nick, ''), new.body);
  END;

  CREATE TRIGGER IF NOT EXISTS messages_ad
    AFTER DELETE ON messages
  BEGIN
    DELETE FROM messages_fts WHERE rowid = old.rowid;
  END;

  CREATE TRIGGER IF NOT EXISTS messages_au
    AFTER UPDATE ON messages
  BEGIN
    DELETE FROM messages_fts WHERE rowid = old.rowid;
    INSERT INTO messages_fts (rowid, messageId, networkId, target, nick, body)
    VALUES (new.rowid, new.id, new.networkId, new.target, coalesce(new.nick, ''), new.body);
  END;

  CREATE INDEX IF NOT EXISTS idx_buffers_network
    ON buffers(networkId, createdAt ASC);

  CREATE INDEX IF NOT EXISTS idx_friends_nick
    ON friends(nick COLLATE NOCASE, createdAt ASC);

  CREATE INDEX IF NOT EXISTS idx_assistant_threads_updated
    ON assistant_threads(updatedAt DESC, createdAt DESC);
`;

type StorageMigrationContext = {
  existedBeforeOpen: boolean;
};

type StorageMigration = {
  version: number;
  apply(db: DatabaseSync, context: StorageMigrationContext): void;
};

const storageMigrations: readonly StorageMigration[] = [
  {
    version: 1,
    apply: (db, context) => {
      migrateLegacyBufferSchema(db);
      ensureColumn(db, 'networks', 'autoJoin', "TEXT NOT NULL DEFAULT '[]'");
      ensureColumn(db, 'networks', 'altNicks', "TEXT NOT NULL DEFAULT '[]'");
      ensureColumn(db, 'networks', 'realName', "TEXT NOT NULL DEFAULT ''");
      ensureColumn(db, 'networks', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
      if (context.existedBeforeOpen) {
        resetStoredMessageHistory(db);
      }
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
    apply: (db) => {
      ensureAssistantTables(db);
    },
  },
  {
    version: 6,
    apply: (db) => {
      ensureColumn(db, 'assistant_threads', 'turnsJson', "TEXT NOT NULL DEFAULT '[]'");
    },
  },
  {
    version: 7,
    apply: (db) => {
      ensureAssistantThreadScope(db);
    },
  },
  {
    version: 8,
    apply: (db) => {
      ensureMessagesSearchIndex(db, true);
    },
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
];

export const bootstrapStorageSchema = (db: DatabaseSync) => {
  db.exec(schemaSql);
};

export const applyStorageMigrations = (db: DatabaseSync, context: StorageMigrationContext) => {
  let version = getUserVersion(db);
  for (const migration of storageMigrations) {
    if (version >= migration.version) {
      continue;
    }
    migration.apply(db, context);
    setUserVersion(db, migration.version);
    version = migration.version;
  }
  repairStorageSchemaDrift(db);
};

export const tableExists = (db: DatabaseSync, table: string) =>
  Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table)
  );

export const tableHasColumn = (db: DatabaseSync, table: string, column: string) =>
  tableExists(db, table)
  && (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .some((entry) => entry.name === column);

const ensureColumn = (db: DatabaseSync, table: string, column: string, definition: string) => {
  if (!tableHasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  }
  return false;
};

const repairStorageSchemaDrift = (db: DatabaseSync) => {
  migrateLegacyBufferSchema(db);
  ensureColumn(db, 'networks', 'autoJoin', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'networks', 'altNicks', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'networks', 'historicalSelfNicks', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'networks', 'realName', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'networks', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'networks', 'templateId', 'TEXT');
  ensureColumn(db, 'networks', 'managerHidden', 'INTEGER NOT NULL DEFAULT 0');
  const addedAuthMethod = ensureColumn(db, 'networks', 'authMethod', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'networks', 'authTarget', "TEXT NOT NULL DEFAULT 'NickServ'");
  ensureColumn(db, 'networks', 'authAccount', "TEXT NOT NULL DEFAULT ''");
  ensureAssistantTables(db);
  ensureMessagesSearchIndex(db, false);
  ensureColumn(db, 'messages', 'speakerRole', "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, 'messages', 'speakerNick', 'TEXT');
  ensureColumn(db, 'messages', 'attributionSource', "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, 'messages', 'attributionConfidence', "TEXT NOT NULL DEFAULT 'low'");
  ensureColumn(db, 'messages', 'importBatchId', 'TEXT');
  ensureColumn(db, 'buffers', 'selfNickAliases', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'buffers', 'priorityUnread', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'buffers', 'lastReadTs', 'INTEGER');
  ensureColumn(db, 'buffers', 'lastReadMessageId', 'TEXT');
  ensureHistoryImportBatchesTable(db);
  if (addedAuthMethod) {
    db.exec("UPDATE networks SET authMethod = 'server-pass' WHERE password IS NOT NULL AND authMethod = 'none'");
  }
  db.exec("UPDATE networks SET authTarget = 'NickServ' WHERE authTarget IS NULL OR authTarget = ''");
};

const migrateLegacyBufferSchema = (db: DatabaseSync) => {
  if (tableHasColumn(db, 'channels', 'networkId') && tableHasColumn(db, 'channels', 'name')) {
    db.exec(`
      INSERT OR IGNORE INTO buffers (id, networkId, kind, target, unread, createdAt, updatedAt)
      SELECT id, networkId, 'channel', name, unread, createdAt, updatedAt
      FROM channels
    `);
    db.exec(`
      INSERT OR IGNORE INTO channel_details (id, topic, users, createdAt, updatedAt)
      SELECT id, topic, users, createdAt, updatedAt
      FROM channels
    `);
    db.exec('DROP TABLE channels');
  }

  if (tableHasColumn(db, 'queries', 'networkId') && tableHasColumn(db, 'queries', 'target')) {
    db.exec(`
      INSERT OR IGNORE INTO buffers (id, networkId, kind, target, unread, createdAt, updatedAt)
      SELECT id, networkId, 'query', target, 0, createdAt, updatedAt
      FROM queries
    `);
    db.exec('DROP TABLE queries');
  }
};

const getUserVersion = (db: DatabaseSync) =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);

const setUserVersion = (db: DatabaseSync, version: number) => {
  db.exec(`PRAGMA user_version = ${version}`);
};

const resetStoredMessageHistory = (db: DatabaseSync) => {
  ensureColumn(db, 'buffers', 'priorityUnread', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'buffers', 'lastReadTs', 'INTEGER');
  ensureColumn(db, 'buffers', 'lastReadMessageId', 'TEXT');
  db.exec('DELETE FROM messages');
  db.prepare('UPDATE buffers SET unread = 0, priorityUnread = 0, lastReadTs = NULL, lastReadMessageId = NULL, updatedAt = ?')
    .run(Date.now());
};

const ensureAssistantTables = (db: DatabaseSync) => {
  db.exec(`
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
    )
  `);
  ensureColumn(db, 'assistant_threads', 'turnsJson', "TEXT NOT NULL DEFAULT '[]'");
  ensureAssistantThreadScope(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      defaultModel TEXT NOT NULL,
      activeThreadId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_assistant_threads_updated
      ON assistant_threads(updatedAt DESC, createdAt DESC)
  `);
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

const ensureAssistantThreadScope = (db: DatabaseSync) => {
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

const ensureHistoryImportBatchesTable = (db: DatabaseSync) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS history_import_batches (
      id TEXT PRIMARY KEY,
      networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
      bufferId TEXT NOT NULL,
      target TEXT NOT NULL,
      selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
      createdAt INTEGER NOT NULL
    )
  `);
};

const backfillQueryBufferSelfNickAliases = (db: DatabaseSync) => {
  const queryBuffers = db.prepare(`
    SELECT buffers.id, networks.nick, networks.altNicks
    FROM buffers
    JOIN networks ON networks.id = buffers.networkId
    WHERE buffers.kind = 'query'
  `).all() as Array<{ id: string; nick: string; altNicks: string }>;
  const readSnapshots = db.prepare(`
    SELECT selfNickSnapshot
    FROM history_import_batches
    WHERE bufferId = ?
    ORDER BY createdAt ASC
  `);
  const updateBuffer = db.prepare(`
    UPDATE buffers
    SET selfNickAliases = ?
    WHERE id = ?
  `);
  for (const buffer of queryBuffers) {
    const currentAliases = parseJson<string[]>(
      (db.prepare('SELECT selfNickAliases FROM buffers WHERE id = ?').get(buffer.id) as { selfNickAliases?: string } | undefined)?.selfNickAliases ?? '[]',
      [],
    );
    if (currentAliases.length > 0) {
      continue;
    }
    const excluded = new Set([
      normalizeIrcIdentifier(buffer.nick),
      ...parseJson<string[]>(buffer.altNicks, []).map((nick) => normalizeIrcIdentifier(nick)),
    ]);
    const aliases: string[] = [];
    const seen = new Set<string>();
    const snapshots = readSnapshots.all(buffer.id) as Array<{ selfNickSnapshot: string }>;
    for (const snapshot of snapshots) {
      for (const nick of parseJson<string[]>(snapshot.selfNickSnapshot, [])) {
        const trimmed = nick.trim();
        if (!trimmed) {
          continue;
        }
        const key = normalizeIrcIdentifier(trimmed);
        if (excluded.has(key) || seen.has(key)) {
          continue;
        }
        seen.add(key);
        aliases.push(trimmed);
      }
    }
    updateBuffer.run(JSON.stringify(aliases), buffer.id);
  }
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const ensureMessagesSearchIndex = (db: DatabaseSync, forceRebuild: boolean) => {
  const hadIndex = tableExists(db, 'messages_fts');
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
      USING fts5(
        messageId UNINDEXED,
        networkId UNINDEXED,
        target UNINDEXED,
        nick,
        body,
        tokenize = 'porter unicode61'
      )
  `);
  db.exec('DROP TRIGGER IF EXISTS messages_ai');
  db.exec('DROP TRIGGER IF EXISTS messages_ad');
  db.exec('DROP TRIGGER IF EXISTS messages_au');
  db.exec(`
    CREATE TRIGGER messages_ai
      AFTER INSERT ON messages
    BEGIN
      INSERT INTO messages_fts (rowid, messageId, networkId, target, nick, body)
      VALUES (new.rowid, new.id, new.networkId, new.target, coalesce(new.nick, ''), new.body);
    END
  `);
  db.exec(`
    CREATE TRIGGER messages_ad
      AFTER DELETE ON messages
    BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END
  `);
  db.exec(`
    CREATE TRIGGER messages_au
      AFTER UPDATE ON messages
    BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
      INSERT INTO messages_fts (rowid, messageId, networkId, target, nick, body)
      VALUES (new.rowid, new.id, new.networkId, new.target, coalesce(new.nick, ''), new.body);
    END
  `);
  if (forceRebuild || !hadIndex || messagesSearchIndexNeedsRebuild(db)) {
    rebuildMessagesSearchIndex(db);
  }
};

const messagesSearchIndexNeedsRebuild = (db: DatabaseSync) => {
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
