import type { DatabaseSync } from 'node:sqlite';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import {
  ensureAssistantTables,
  ensureAssistantThreadScope,
  ensureHistoryImportBatchesTable,
  ensureMessagesSearchIndex,
} from './storage-schema-helpers.js';
import { storageBootstrapSchemaSql } from './storage-bootstrap-schema.js';

export const currentStorageSchemaVersion = 11;

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
    apply: (db) => {
      ensureAssistantTables(db, ensureColumn);
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
      ensureAssistantThreadScope(db, ensureColumn);
    },
  },
  {
    version: 8,
    apply: (db) => {
      ensureMessagesSearchIndex(db, true, tableExists);
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
  db.exec(storageBootstrapSchemaSql);
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
