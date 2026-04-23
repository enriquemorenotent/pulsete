import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import {
  replaceBufferSelfNickAliases,
  replaceNetworkAltNicks,
  replaceNetworkAutoJoinChannels,
  replaceNetworkHistoricalSelfNicks,
} from './storage-owned-lists.js';
import {
  ensureHistoryImportBatchesTable,
  ensureMessagesSearchIndex,
} from './storage-schema-helpers.js';
import { storageBootstrapSchemaSql } from './storage-bootstrap-schema.js';

export const currentStorageSchemaVersion = 14;

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
    apply: (db) => {
      if (tableHasColumn(db, 'messages', 'bufferId')) {
        ensureMessagesSearchIndex(db, true, tableExists);
      }
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
      migrateNormalizedStorage(db);
    },
  },
];

export const bootstrapStorageSchema = (db: DatabaseSync) => {
  db.exec(storageBootstrapSchemaSql);
};

export const applyStorageMigrations = (db: DatabaseSync, context: StorageMigrationContext) => {
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
  if (tableHasColumn(db, 'messages', 'bufferId')) {
    ensureMessagesSearchIndex(db, false, tableExists);
  }
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

const migrateNormalizedStorage = (db: DatabaseSync) => {
  const networkLists = tableHasColumn(db, 'networks', 'altNicks')
    ? (
        db.prepare('SELECT id, altNicks, historicalSelfNicks, autoJoin FROM networks').all() as Array<{
          id: string;
          altNicks: string;
          historicalSelfNicks: string;
          autoJoin: string;
        }>
      )
    : [];
  const bufferAliases = tableHasColumn(db, 'buffers', 'selfNickAliases')
    ? (
        db.prepare('SELECT id, selfNickAliases FROM buffers').all() as Array<{
          id: string;
          selfNickAliases: string;
        }>
      )
    : [];
  const existingBuffers = (db.prepare(`
    SELECT id, networkId, kind, target, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt
    FROM buffers
    ORDER BY createdAt ASC
  `).all() as Array<{
    id: string;
    networkId: string;
    kind: 'server' | 'channel' | 'query';
    target: string;
    unread: number;
    priorityUnread: number;
    lastReadTs: number | null;
    lastReadMessageId: string | null;
    createdAt: number;
    updatedAt: number;
  }>).map((row) => ({
    ...row,
    isOpen: true,
  }));
  const messageConversations = tableHasColumn(db, 'messages', 'networkId')
    ? (
        db.prepare(`
          SELECT networkId, target, MIN(ts) AS createdAt
          FROM messages
          GROUP BY networkId, target
        `).all() as Array<{ networkId: string; target: string; createdAt: number }>
      )
    : [];
  const batchConversations = tableHasColumn(db, 'history_import_batches', 'networkId')
    ? (
        db.prepare(`
          SELECT networkId, target, MIN(createdAt) AS createdAt
          FROM history_import_batches
          GROUP BY networkId, target
        `).all() as Array<{ networkId: string; target: string; createdAt: number }>
      )
    : [];

  const buffersByKey = new Map<string, typeof existingBuffers[number]>();
  const buffersById = new Map<string, typeof existingBuffers[number]>();
  for (const buffer of existingBuffers) {
    buffersByKey.set(bufferConversationKey(buffer.networkId, buffer.target), buffer);
    buffersById.set(buffer.id, buffer);
  }
  for (const conversation of [...messageConversations, ...batchConversations]) {
    const key = bufferConversationKey(conversation.networkId, conversation.target);
    if (buffersByKey.has(key)) {
      continue;
    }
    const fallback = {
      id: randomUUID(),
      networkId: conversation.networkId,
      kind: inferBufferKind(conversation.target),
      target: conversation.target,
      isOpen: conversation.target === 'server',
      unread: 0,
      priorityUnread: 0,
      lastReadTs: null,
      lastReadMessageId: null,
      createdAt: conversation.createdAt ?? Date.now(),
      updatedAt: conversation.createdAt ?? Date.now(),
    } as const;
    buffersByKey.set(key, fallback);
    buffersById.set(fallback.id, fallback);
  }

  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    dropNormalizedStorageScratchTables(db);
    db.exec('DROP TRIGGER IF EXISTS messages_ai');
    db.exec('DROP TRIGGER IF EXISTS messages_ad');
    db.exec('DROP TRIGGER IF EXISTS messages_au');
    db.exec('DROP TABLE IF EXISTS messages_fts');
    db.exec('DROP TABLE IF EXISTS network_alt_nicks');
    db.exec('DROP TABLE IF EXISTS network_historical_self_nicks');
    db.exec('DROP TABLE IF EXISTS network_auto_join_channels');
    db.exec('DROP TABLE IF EXISTS buffer_self_nick_aliases');

    db.exec(`
      CREATE TABLE networks_next (
        id TEXT PRIMARY KEY,
        templateId TEXT,
        managerHidden INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        tls INTEGER NOT NULL,
        nick TEXT NOT NULL,
        username TEXT NOT NULL,
        realName TEXT NOT NULL DEFAULT '',
        password TEXT,
        authMethod TEXT NOT NULL DEFAULT 'none',
        authTarget TEXT NOT NULL DEFAULT 'NickServ',
        authAccount TEXT NOT NULL DEFAULT '',
        favorite INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE buffers_next (
        id TEXT PRIMARY KEY,
        networkId TEXT NOT NULL REFERENCES networks_next(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        target TEXT NOT NULL,
        targetKey TEXT NOT NULL,
        isOpen INTEGER NOT NULL DEFAULT 1,
        unread INTEGER NOT NULL DEFAULT 0,
        priorityUnread INTEGER NOT NULL DEFAULT 0,
        lastReadTs INTEGER,
        lastReadMessageId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        UNIQUE(networkId, targetKey)
      );
      CREATE TABLE channel_details_next (
        id TEXT PRIMARY KEY REFERENCES buffers_next(id) ON DELETE CASCADE,
        topic TEXT NOT NULL DEFAULT '',
        users TEXT NOT NULL DEFAULT '[]',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE messages_next (
        id TEXT PRIMARY KEY,
        bufferId TEXT NOT NULL REFERENCES buffers_next(id) ON DELETE CASCADE,
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
      CREATE TABLE history_import_batches_next (
        id TEXT PRIMARY KEY,
        bufferId TEXT NOT NULL REFERENCES buffers_next(id) ON DELETE CASCADE,
        selfNickSnapshot TEXT NOT NULL DEFAULT '[]',
        createdAt INTEGER NOT NULL
      );
    `);

    db.exec(`
      INSERT INTO networks_next
        (id, templateId, managerHidden, name, host, port, tls, nick, username, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt)
      SELECT id, templateId, managerHidden, name, host, port, tls, nick, username, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt
      FROM networks
    `);

    const insertBuffer = db.prepare(`
      INSERT INTO buffers_next
        (id, networkId, kind, target, targetKey, isOpen, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const buffer of buffersById.values()) {
      insertBuffer.run(
        buffer.id,
        buffer.networkId,
        buffer.kind,
        buffer.target,
        normalizeIrcIdentifier(buffer.target),
        buffer.isOpen ? 1 : 0,
        buffer.unread,
        buffer.priorityUnread,
        buffer.lastReadTs,
        buffer.lastReadMessageId,
        buffer.createdAt,
        buffer.updatedAt,
      );
    }

    if (tableExists(db, 'channel_details')) {
      db.exec(`
        INSERT INTO channel_details_next (id, topic, users, createdAt, updatedAt)
        SELECT id, topic, users, createdAt, updatedAt
        FROM channel_details
      `);
    }

    if (tableHasColumn(db, 'messages', 'networkId')) {
      const insertMessage = db.prepare(`
        INSERT INTO messages_next
          (id, bufferId, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const rows = db.prepare(`
        SELECT id, networkId, target, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts
        FROM messages
        ORDER BY rowid ASC
      `).all() as Array<{
        id: string;
        networkId: string;
        target: string;
        nick: string | null;
        speakerRole: string | null;
        speakerNick: string | null;
        attributionSource: string | null;
        attributionConfidence: string | null;
        importBatchId: string | null;
        body: string;
        kind: string;
        self: number;
        ts: number;
      }>;
      for (const row of rows) {
        const buffer = buffersByKey.get(bufferConversationKey(row.networkId, row.target));
        if (!buffer) {
          continue;
        }
        insertMessage.run(
          row.id,
          buffer.id,
          row.nick,
          row.speakerRole ?? 'unknown',
          row.speakerNick,
          row.attributionSource ?? 'unknown',
          row.attributionConfidence ?? 'low',
          row.importBatchId,
          row.body,
          row.kind,
          row.self,
          row.ts,
        );
      }
    }

    if (tableExists(db, 'history_import_batches')) {
      const insertBatch = db.prepare(`
        INSERT INTO history_import_batches_next
          (id, bufferId, selfNickSnapshot, createdAt)
        VALUES (?, ?, ?, ?)
      `);
      const hasLegacyBatchColumns =
        tableHasColumn(db, 'history_import_batches', 'networkId')
        && tableHasColumn(db, 'history_import_batches', 'target');
      const rows = hasLegacyBatchColumns
        ? db.prepare(`
            SELECT id, bufferId, networkId, target, selfNickSnapshot, createdAt
            FROM history_import_batches
            ORDER BY createdAt ASC
          `).all() as Array<{
            id: string;
            bufferId: string;
            networkId: string;
            target: string;
            selfNickSnapshot: string;
            createdAt: number;
          }>
        : db.prepare(`
            SELECT id, bufferId, selfNickSnapshot, createdAt
            FROM history_import_batches
            ORDER BY createdAt ASC
          `).all() as Array<{
            id: string;
            bufferId: string;
            selfNickSnapshot: string;
            createdAt: number;
          }>;
      for (const row of rows) {
        const legacyRow = row as {
          networkId?: string;
          target?: string;
        };
        const buffer = buffersById.get(row.bufferId)
          ?? (typeof legacyRow.networkId === 'string' && typeof legacyRow.target === 'string'
            ? buffersByKey.get(bufferConversationKey(legacyRow.networkId, legacyRow.target))
            : null);
        if (!buffer) {
          continue;
        }
        insertBatch.run(row.id, buffer.id, row.selfNickSnapshot, row.createdAt);
      }
    }

    db.exec('DROP TABLE history_import_batches');
    db.exec('DROP TABLE messages');
    db.exec('DROP TABLE channel_details');
    db.exec('DROP TABLE buffers');
    db.exec('DROP TABLE networks');
    db.exec('ALTER TABLE networks_next RENAME TO networks');
    db.exec('ALTER TABLE buffers_next RENAME TO buffers');
    db.exec('ALTER TABLE channel_details_next RENAME TO channel_details');
    db.exec('ALTER TABLE messages_next RENAME TO messages');
    db.exec('ALTER TABLE history_import_batches_next RENAME TO history_import_batches');
    db.exec(storageBootstrapSchemaSql);

    for (const row of networkLists) {
      replaceNetworkAltNicks(db, row.id, parseJson<string[]>(row.altNicks, []));
      replaceNetworkHistoricalSelfNicks(db, row.id, parseJson<string[]>(row.historicalSelfNicks, []));
      replaceNetworkAutoJoinChannels(db, row.id, parseJson<string[]>(row.autoJoin, []));
    }
    for (const row of bufferAliases) {
      replaceBufferSelfNickAliases(db, row.id, parseJson<string[]>(row.selfNickAliases, []));
    }

    ensureMessagesSearchIndex(db, true, tableExists);
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

const inferBufferKind = (target: string) =>
  target === 'server'
    ? 'server' as const
    : /^[#&+!]/.test(target)
      ? 'channel' as const
      : 'query' as const;

const bufferConversationKey = (networkId: string, target: string) =>
  `${networkId}:${normalizeIrcIdentifier(target)}`;

const dropNormalizedStorageScratchTables = (db: DatabaseSync) => {
  db.exec('DROP TABLE IF EXISTS history_import_batches_next');
  db.exec('DROP TABLE IF EXISTS messages_next');
  db.exec('DROP TABLE IF EXISTS channel_details_next');
  db.exec('DROP TABLE IF EXISTS buffers_next');
  db.exec('DROP TABLE IF EXISTS networks_next');
};
