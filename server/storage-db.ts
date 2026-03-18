import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const schemaSql = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    salt TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS networks (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    unread INTEGER NOT NULL DEFAULT 0,
    users TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(userId, networkId, name)
  );

  CREATE TABLE IF NOT EXISTS queries (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(userId, networkId, target)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    nick TEXT,
    body TEXT NOT NULL,
    kind TEXT NOT NULL,
    self INTEGER NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_buffer
    ON messages(userId, networkId, target, ts DESC);

  CREATE INDEX IF NOT EXISTS idx_channels_network
    ON channels(userId, networkId);

  CREATE INDEX IF NOT EXISTS idx_queries_network
    ON queries(userId, networkId, createdAt ASC);
`;

export const createDatabase = (filePath = resolve('data', 'pulsete.sqlite')) => {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec(schemaSql);
  ensureColumn(db, 'networks', 'altNicks', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, 'networks', 'realName', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'networks', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'networks', 'templateId', 'TEXT');
  ensureColumn(db, 'networks', 'managerHidden', 'INTEGER NOT NULL DEFAULT 0');
  return db;
};

const ensureColumn = (db: DatabaseSync, table: string, column: string, definition: string) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};
