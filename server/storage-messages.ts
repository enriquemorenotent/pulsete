import type { DatabaseSync } from 'node:sqlite';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { MessageInput, MessagePage, MessageRow } from './storage-types.js';
import { toMessage } from './storage-utils.js';

export const appendMessage = (db: DatabaseSync, input: MessageInput, lookup: MessageLookup) => {
  db.prepare(
    `INSERT INTO messages
       (id, networkId, target, nick, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.networkId,
    input.target,
    input.nick,
    input.body,
    input.kind,
    input.self ? 1 : 0,
    input.ts
  );
  return lookup(input.id)!;
};

export const getMessageById = (db: DatabaseSync, messageId: string) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages WHERE id = ?';
  const row = db.prepare(sql).get(messageId) as MessageRow | undefined;
  return row ? toMessage(row) : null;
};

export const listMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  return selectMessages(db, networkId, matchingTargets, limit);
};

export const listMessagePage = (
  db: DatabaseSync,
  networkId: string,
  target: string,
  limit = 200,
  beforeMessageId?: string,
): MessagePage => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return emptyMessagePage;
  }
  const cursor = beforeMessageId ? (getMessageCursor(db, beforeMessageId) ?? null) : null;
  if (beforeMessageId && (!cursor || cursor.networkId !== networkId || !matchingTargets.includes(cursor.target))) {
    return emptyMessagePage;
  }
  return selectMessagePage(db, networkId, matchingTargets, limit, cursor);
};

export const listAllMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  return selectMessages(db, networkId, matchingTargets);
};

export const listOpeningMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts ASC, rowid ASC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(networkId, ...matchingTargets, limit) as MessageRow[];
  return rows.map(toMessage);
};

export const listRecentMessagesForBuffer = (db: DatabaseSync, networkId: string, target: string, limit = 200) =>
  listMessages(db, networkId, target, limit);

export const getMessageWindow = (db: DatabaseSync, messageId: string, before: number, after: number) => {
  const cursor = getMessageCursor(db, messageId);
  if (!cursor) {
    return [];
  }
  const matchingTargets = listMatchingTargets(db, cursor.networkId, cursor.target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const beforeRows = db.prepare(`
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND (ts < ? OR (ts = ? AND rowid <= ?))
    ORDER BY ts DESC, rowid DESC
    LIMIT ?
  `).all(
    cursor.networkId,
    ...matchingTargets,
    cursor.ts,
    cursor.ts,
    cursor.rowid,
    before + 1,
  ) as MessageRow[];
  const afterRows = db.prepare(`
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND (ts > ? OR (ts = ? AND rowid > ?))
    ORDER BY ts ASC, rowid ASC
    LIMIT ?
  `).all(
    cursor.networkId,
    ...matchingTargets,
    cursor.ts,
    cursor.ts,
    cursor.rowid,
    after,
  ) as MessageRow[];
  return [...beforeRows.reverse(), ...afterRows].map(toMessage);
};

export const searchMessages = (db: DatabaseSync, networkId: string, target: string, query: string, limit = 10) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0 || query.trim().length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT
      m.id,
      m.networkId,
      m.target,
      m.nick,
      m.body,
      m.kind,
      m.self,
      m.ts,
      bm25(messages_fts, 1.2, 1.0) AS score
    FROM messages_fts
    JOIN messages AS m ON m.rowid = messages_fts.rowid
    WHERE messages_fts MATCH ?
      AND m.networkId = ?
      AND m.target IN (${placeholders})
    ORDER BY score ASC, m.ts ASC, m.rowid ASC
    LIMIT ?
  `).all(query, networkId, ...matchingTargets, limit) as Array<MessageRow & { score: number }>;
  return rows.map((row) => ({
    message: toMessage(row),
    score: row.score,
  }));
};

export const deleteMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts ASC, rowid ASC
  `;
  const rows = db.prepare(sql).all(networkId, ...matchingTargets) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE networkId = ? AND target IN (${placeholders})`).run(networkId, ...matchingTargets);
  return rows.map(toMessage);
};

export const listRecentMessages = (db: DatabaseSync, limit = 200) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages ORDER BY ts DESC, rowid DESC LIMIT ?';
  const rows = db.prepare(sql).all(limit) as MessageRow[];
  return rows.reverse().map(toMessage);
};

export const deleteMessagesByIdPrefixes = (db: DatabaseSync, prefixes: string[]) => {
  const clauses = buildIdPrefixWhereClause(prefixes);
  if (!clauses) {
    return [];
  }
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE ${clauses.where}
    ORDER BY ts ASC, rowid ASC
  `;
  const rows = db.prepare(sql).all(...clauses.args) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE ${clauses.where}`).run(...clauses.args);
  return rows.map(toMessage);
};

type MessageLookup = (messageId: string) => MessageInput | null;
type MessageCursor = { networkId: string; rowid: number; target: string; ts: number };

const emptyMessagePage: MessagePage = { messages: [], hasMore: false };

const listMatchingTargets = (db: DatabaseSync, networkId: string, target: string) => {
  const rows = db.prepare('SELECT DISTINCT target FROM messages WHERE networkId = ?').all(networkId) as Array<{ target: string }>;
  return rows
    .map((row) => row.target)
    .filter((candidate) => isSameIrcIdentifier(candidate, target));
};

const getMessageCursor = (db: DatabaseSync, messageId: string) => {
  const sql = 'SELECT networkId, rowid, target, ts FROM messages WHERE id = ?';
  return db.prepare(sql).get(messageId) as MessageCursor | undefined;
};

const selectMessages = (
  db: DatabaseSync,
  networkId: string,
  matchingTargets: string[],
  limit?: number,
) => {
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const limitClause = typeof limit === 'number' ? '\n    LIMIT ?' : '';
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts DESC, rowid DESC${limitClause}
  `;
  const args = typeof limit === 'number'
    ? [networkId, ...matchingTargets, limit]
    : [networkId, ...matchingTargets];
  const rows = db.prepare(sql).all(...args) as MessageRow[];
  return rows.reverse().map(toMessage);
};

const selectMessagePage = (
  db: DatabaseSync,
  networkId: string,
  matchingTargets: string[],
  limit: number,
  before: MessageCursor | null,
): MessagePage => {
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const beforeClause = before ? '\n    AND (ts < ? OR (ts = ? AND rowid < ?))' : '';
  const sql = `
    SELECT id, networkId, target, nick, body, kind, self, ts
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})${beforeClause}
    ORDER BY ts DESC, rowid DESC
    LIMIT ?
  `;
  const args = before
    ? [networkId, ...matchingTargets, before.ts, before.ts, before.rowid, limit + 1]
    : [networkId, ...matchingTargets, limit + 1];
  const rows = db.prepare(sql).all(...args) as MessageRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: pageRows.reverse().map(toMessage),
    hasMore,
  };
};

const buildIdPrefixWhereClause = (prefixes: string[]) => {
  const normalized = [...new Set(prefixes.filter(Boolean))];
  if (normalized.length === 0) {
    return null;
  }
  return {
    where: normalized.map(() => 'substr(id, 1, ?) = ?').join(' OR '),
    args: normalized.flatMap((prefix) => [prefix.length, prefix]),
  };
};
