import { identityFromNick } from '../shared/user-identity.js';
import {
  tableExists,
  tableHasColumn,
} from './storage-schema-helpers.js';
import type { SqliteDb } from './storage-sqlite.js';

export const ensureNickEmojiTable = (db: SqliteDb) => {
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

export const ensureIdentityIndexes = (db: SqliteDb) => {
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

export const migrateIdentityScopedTables = (db: SqliteDb) => {
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
