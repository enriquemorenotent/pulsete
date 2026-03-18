import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { badRequest, conflict } from './app-error.js';
import { requireIrcToken } from './irc-validate.js';
import { hashPassword } from './storage-utils.js';
import type { AuthUser, SessionRecord, SessionRow, UserRow } from './storage-types.js';

export const hasUsers = (db: DatabaseSync) => countRows(db, 'SELECT COUNT(*) AS count FROM users') > 0;

export const createUser = (db: DatabaseSync, username: string, password: string): AuthUser => {
  const nextUsername = normalizeUsername(username);
  assertCredentials(nextUsername, password);
  return createUserRecord(db, nextUsername, password);
};

export const bootstrapUser = (db: DatabaseSync, username: string, password: string) => {
  const nextUsername = normalizeUsername(username);
  assertCredentials(nextUsername, password);
  return withImmediateTransaction(db, () => {
    if (hasUsers(db)) {
      throw conflict('Bootstrap already completed');
    }
    return insertUser(db, nextUsername, password);
  });
};

export const authenticate = (db: DatabaseSync, username: string, password: string): AuthUser | null => {
  const nextUsername = normalizeUsername(username);
  if (!nextUsername || !password) {
    return null;
  }
  const row = pickAuthenticatedUser(findCanonicalUsers(db, nextUsername), username, password);
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
  if (!row) {
    return null;
  }
  if (row.expiresAt < Date.now()) {
    deleteSession(db, token);
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

export const hasActiveSessions = (db: DatabaseSync, userId: string) =>
  countRows(db, 'SELECT COUNT(*) AS count FROM sessions WHERE userId = ? AND expiresAt >= ?', userId, Date.now()) > 0;

export const getNextSessionExpiry = (db: DatabaseSync, userId: string) => {
  const row = db.prepare('SELECT MIN(expiresAt) AS expiresAt FROM sessions WHERE userId = ? AND expiresAt >= ?')
    .get(userId, Date.now()) as { expiresAt: number | null };
  return row.expiresAt;
};

const countRows = (db: DatabaseSync, sql: string, ...params: SQLInputValue[]) => {
  const row = db.prepare(sql).get(...params) as { count: number };
  return row.count;
};

const normalizeUsername = (username: string) => username.trim();

const assertCredentials = (username: string, password: string) => {
  if (!username) {
    throw badRequest('Username is required');
  }
  requireIrcToken(username, 'Username cannot contain whitespace');
  if (!password) {
    throw badRequest('Password is required');
  }
};

const createUserRecord = (db: DatabaseSync, username: string, password: string) =>
  withImmediateTransaction(db, () => insertUser(db, username, password));

const insertUser = (db: DatabaseSync, username: string, password: string) => {
  if (findCanonicalUsers(db, username).length > 0) {
    throw conflict('Username already exists');
  }
  const id = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  try {
    db.prepare('INSERT INTO users (id, username, passwordHash, salt, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, passwordHash, salt, Date.now());
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: users\.username/.test(error.message)) {
      throw conflict('Username already exists');
    }
    throw error;
  }
  return { id, username };
};

const withImmediateTransaction = <T>(db: DatabaseSync, action: () => T) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures when SQLite has already unwound the transaction.
    }
    throw error;
  }
};

const findCanonicalUsers = (db: DatabaseSync, username: string) =>
  db.prepare(
    `SELECT id, username, passwordHash, salt, createdAt
       FROM users
      ORDER BY createdAt ASC`
  ).all()
    .filter((user) => normalizeUsername((user as UserRow).username) === username) as UserRow[];

const pickAuthenticatedUser = (users: UserRow[], username: string, password: string) => {
  if (users.length === 0) {
    return null;
  }
  const exactMatch = users.find((user) => user.username === username);
  if (exactMatch && hashPassword(password, exactMatch.salt) === exactMatch.passwordHash) {
    return exactMatch;
  }
  const passwordMatches = users.filter((user) => hashPassword(password, user.salt) === user.passwordHash);
  return passwordMatches.length === 1 ? passwordMatches[0] : null;
};
