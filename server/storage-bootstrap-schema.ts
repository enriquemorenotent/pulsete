import {
  assistantTablesSchemaSql,
  historyImportBatchesSchemaSql,
  messagesSearchIndexSchemaSql,
} from './storage-schema-helpers.js';

export const storageBootstrapSchemaSql = `
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

${historyImportBatchesSchemaSql}

  CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    nick TEXT NOT NULL COLLATE NOCASE UNIQUE,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

${assistantTablesSchemaSql}

  CREATE INDEX IF NOT EXISTS idx_messages_buffer
    ON messages(networkId, target, ts DESC);

${messagesSearchIndexSchemaSql}

  CREATE INDEX IF NOT EXISTS idx_buffers_network
    ON buffers(networkId, createdAt ASC);

  CREATE INDEX IF NOT EXISTS idx_friends_nick
    ON friends(nick COLLATE NOCASE, createdAt ASC);
`;
