import type { DatabaseSync } from 'node:sqlite';
import type { MessagePage, MessageRow } from './storage-types.js';
import {
  emptyMessagePage,
  getMessageCursor,
  hydrateMessages,
  listMatchingTargets,
  messageColumns,
  type MessageCursor,
} from './storage-message-shared.js';

export const getMessageById = (db: DatabaseSync, messageId: string) => {
  const row = db.prepare(`SELECT ${messageColumns} FROM messages WHERE id = ?`).get(messageId) as MessageRow | undefined;
  return row ? hydrateMessages(db, [row])[0] ?? null : null;
};

export const listMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  return matchingTargets.length > 0 ? selectMessages(db, networkId, matchingTargets, limit) : [];
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
  return beforeMessageId && (!cursor || cursor.networkId !== networkId || !matchingTargets.includes(cursor.target))
    ? emptyMessagePage
    : selectMessagePage(db, networkId, matchingTargets, limit, cursor);
};

export const listAllMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  return matchingTargets.length > 0 ? selectMessages(db, networkId, matchingTargets) : [];
};

export const listOpeningMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts ASC, rowid ASC
    LIMIT ?
  `).all(networkId, ...matchingTargets, limit) as MessageRow[];
  return hydrateMessages(db, rows);
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
    SELECT ${messageColumns} FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND (ts < ? OR (ts = ? AND rowid <= ?))
    ORDER BY ts DESC, rowid DESC LIMIT ?
  `).all(cursor.networkId, ...matchingTargets, cursor.ts, cursor.ts, cursor.rowid, before + 1) as MessageRow[];
  const afterRows = db.prepare(`
    SELECT ${messageColumns} FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND (ts > ? OR (ts = ? AND rowid > ?))
    ORDER BY ts ASC, rowid ASC LIMIT ?
  `).all(cursor.networkId, ...matchingTargets, cursor.ts, cursor.ts, cursor.rowid, after) as MessageRow[];
  return hydrateMessages(db, [...beforeRows.reverse(), ...afterRows]);
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
      m.speakerRole,
      m.speakerNick,
      m.attributionSource,
      m.attributionConfidence,
      m.importBatchId,
      m.body,
      m.kind,
      m.self,
      m.ts,
      bm25(messages_fts, 1.2, 1.0) AS score
    FROM messages_fts
    JOIN messages AS m ON m.rowid = messages_fts.rowid
    WHERE messages_fts MATCH ? AND m.networkId = ? AND m.target IN (${placeholders})
    ORDER BY score ASC, m.ts ASC, m.rowid ASC
    LIMIT ?
  `).all(query, networkId, ...matchingTargets, limit) as Array<MessageRow & { score: number }>;
  const messages = hydrateMessages(db, rows);
  return messages.map((message, index) => ({ message, score: rows[index]!.score }));
};

export const listRecentMessages = (db: DatabaseSync, limit = 200) => {
  const rows = db.prepare(`SELECT ${messageColumns} FROM messages ORDER BY ts DESC, rowid DESC LIMIT ?`).all(limit) as MessageRow[];
  return hydrateMessages(db, rows).reverse();
};

const selectMessages = (db: DatabaseSync, networkId: string, matchingTargets: string[], limit?: number) => {
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const limitClause = typeof limit === 'number' ? '\n    LIMIT ?' : '';
  const args = typeof limit === 'number' ? [networkId, ...matchingTargets, limit] : [networkId, ...matchingTargets];
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts DESC, rowid DESC${limitClause}
  `).all(...args) as MessageRow[];
  return hydrateMessages(db, rows).reverse();
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
  const args = before
    ? [networkId, ...matchingTargets, before.ts, before.ts, before.rowid, limit + 1]
    : [networkId, ...matchingTargets, limit + 1];
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})${beforeClause}
    ORDER BY ts DESC, rowid DESC
    LIMIT ?
  `).all(...args) as MessageRow[];
  return {
    messages: hydrateMessages(db, rows.length > limit ? rows.slice(0, limit) : rows).reverse(),
    hasMore: rows.length > limit,
  };
};
