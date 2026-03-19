import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const currentSchemaVersion = 1;

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
    username TEXT NOT NULL,
    realName TEXT NOT NULL DEFAULT '',
    password TEXT,
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
    body TEXT NOT NULL,
    kind TEXT NOT NULL,
    self INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_buffer
    ON messages(networkId, target, ts DESC);

  CREATE INDEX IF NOT EXISTS idx_buffers_network
    ON buffers(networkId, createdAt ASC);
`;

export const createDatabase = (filePath = resolve('data', 'pulsete.sqlite')) => {
  mkdirSync(dirname(filePath), { recursive: true });
  backupLegacyDatabaseIfNeeded(filePath);
  const existedBeforeOpen = existsSync(filePath);
  const db = new DatabaseSync(filePath);
  db.exec(schemaSql);
  migrateLegacyBufferSchema(db);
  ensureColumn(db, 'networks', 'autoJoin', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'networks', 'altNicks', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'networks', 'realName', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'networks', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'networks', 'templateId', 'TEXT');
  ensureColumn(db, 'networks', 'managerHidden', 'INTEGER NOT NULL DEFAULT 0');
  applySchemaUpgrades(db, existedBeforeOpen);
  return db;
};

const backupLegacyDatabaseIfNeeded = (filePath: string) => {
  if (!existsSync(filePath)) {
    return;
  }
  const db = new DatabaseSync(filePath);
  const shouldBackup = hasLegacyAuthSchema(db);
  db.close();
  if (!shouldBackup) {
    return;
  }
  const suffix = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = `${filePath}.legacy-${suffix}`;
  renameIfExists(filePath, backupFilePath);
  renameIfExists(`${filePath}-wal`, `${backupFilePath}-wal`);
  renameIfExists(`${filePath}-shm`, `${backupFilePath}-shm`);
};

const hasLegacyAuthSchema = (db: DatabaseSync) =>
  tableExists(db, 'users') ||
  tableExists(db, 'sessions') ||
  tableHasColumn(db, 'networks', 'userId') ||
  tableHasColumn(db, 'channels', 'userId') ||
  tableHasColumn(db, 'queries', 'userId') ||
  tableHasColumn(db, 'messages', 'userId');

const tableExists = (db: DatabaseSync, table: string) =>
  Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table)
  );

const tableHasColumn = (db: DatabaseSync, table: string, column: string) =>
  tableExists(db, table) &&
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .some((entry) => entry.name === column);

const renameIfExists = (source: string, target: string) => {
  if (existsSync(source)) {
    renameSync(source, target);
  }
};

const ensureColumn = (db: DatabaseSync, table: string, column: string, definition: string) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
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

const applySchemaUpgrades = (db: DatabaseSync, existedBeforeOpen: boolean) => {
  const currentVersion = getUserVersion(db);
  if (!existedBeforeOpen) {
    setUserVersion(db, currentSchemaVersion);
    return;
  }
  if (currentVersion < 1) {
    resetStoredMessageHistory(db);
  }
  if (currentVersion < currentSchemaVersion) {
    setUserVersion(db, currentSchemaVersion);
  }
};

const getUserVersion = (db: DatabaseSync) =>
  Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);

const setUserVersion = (db: DatabaseSync, version: number) => {
  db.exec(`PRAGMA user_version = ${version}`);
};

const resetStoredMessageHistory = (db: DatabaseSync) => {
  db.exec('DELETE FROM messages');
  db.prepare('UPDATE buffers SET unread = 0, updatedAt = ?').run(Date.now());
};
