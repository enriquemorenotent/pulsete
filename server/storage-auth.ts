import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './storage-utils.js';
import type { AuthUser, SessionRecord, SessionRow, UserRow } from './storage-types.js';

export const hasUsers = (db: DatabaseSync) => countRows(db, 'SELECT COUNT(*) AS count FROM users') > 0;

export const createUser = (db: DatabaseSync, username: string, password: string): AuthUser => {
  const id = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(id, username, passwordHash, salt, Date.now());
  return { id, username };
};

export const bootstrapUser = (db: DatabaseSync, username: string, password: string) => {
  if (hasUsers(db)) {
    throw new Error('Bootstrap has already been completed');
  }
  return createUser(db, username, password);
};

export const authenticate = (db: DatabaseSync, username: string, password: string): AuthUser | null => {
  const row = db.prepare('SELECT id, username, passwordHash, salt FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  if (!row) {
    return null;
  }
  return hashPassword(password, row.salt) === row.passwordHash ? { id: row.id, username: row.username } : null;
};

export const getUserById = (db: DatabaseSync, userId: string): AuthUser | null => {
  const row = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as AuthUser | undefined;
  return row ?? null;
};

export const createSession = (db: DatabaseSync, userId: string) => {
  const token = randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + 1000 * 60 * 60 * 24 * 30;
  db.prepare('INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
    .run(token, userId, createdAt, expiresAt);
  return { token, userId, createdAt, expiresAt };
};

export const getSession = (db: DatabaseSync, token: string): SessionRecord | null => {
  const row = db.prepare('SELECT token, userId, createdAt, expiresAt FROM sessions WHERE token = ?')
    .get(token) as SessionRow | undefined;
  if (!row || row.expiresAt < Date.now()) {
    return null;
  }
  const user = getUserById(db, row.userId);
  return user ? { ...row, user } : null;
};

export const deleteSession = (db: DatabaseSync, token: string) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
};

export const deleteExpiredSessions = (db: DatabaseSync) => {
  db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(Date.now());
};

const countRows = (db: DatabaseSync, sql: string) => {
  const row = db.prepare(sql).get() as { count: number };
  return row.count;
};
