import type { DatabaseSync } from 'node:sqlite';
import type { MessagePage, MessageRow } from './storage-types.js';
import {
  emptyMessagePage,
  getMessageBufferId,
  getMessageCursor,
  hydrateMessages,
  messageColumns,
  messageJoin,
  type MessageCursor,
} from './storage-message-shared.js';

export const getMessageById = (db: DatabaseSync, messageId: string) => {
  const row = db.prepare(`SELECT ${messageColumns} ${messageJoin} WHERE m.id = ?`).get(messageId) as MessageRow | undefined;
  return row ? hydrateMessages(db, [row])[0] ?? null : null;
};

export const listMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const bufferId = getMessageBufferId(db, networkId, target);
  return bufferId ? selectMessages(db, bufferId, limit) : [];
};

export const listMessagePage = (
  db: DatabaseSync,
  networkId: string,
  target: string,
  limit = 200,
  beforeMessageId?: string,
): MessagePage => {
  const bufferId = getMessageBufferId(db, networkId, target);
  if (!bufferId) {
    return emptyMessagePage;
  }
  const cursor = beforeMessageId ? (getMessageCursor(db, beforeMessageId) ?? null) : null;
  return beforeMessageId && (!cursor || cursor.bufferId !== bufferId)
    ? emptyMessagePage
    : selectMessagePage(db, bufferId, limit, cursor);
};

export const listAllMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const bufferId = getMessageBufferId(db, networkId, target);
  return bufferId ? selectMessages(db, bufferId) : [];
};

export const listOpeningMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const bufferId = getMessageBufferId(db, networkId, target);
  if (!bufferId) {
    return [];
  }
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE m.bufferId = ?
    ORDER BY m.ts ASC, m.rowid ASC
    LIMIT ?
  `).all(bufferId, limit) as MessageRow[];
  return hydrateMessages(db, rows);
};

export const listRecentMessagesForBuffer = (db: DatabaseSync, networkId: string, target: string, limit = 200) =>
  listMessages(db, networkId, target, limit);

export const getMessageWindow = (db: DatabaseSync, messageId: string, before: number, after: number) => {
  const cursor = getMessageCursor(db, messageId);
  if (!cursor) {
    return [];
  }
  const beforeRows = db.prepare(`
    SELECT ${messageColumns} ${messageJoin}
    WHERE m.bufferId = ?
      AND (m.ts < ? OR (m.ts = ? AND m.rowid <= ?))
    ORDER BY m.ts DESC, m.rowid DESC LIMIT ?
  `).all(cursor.bufferId, cursor.ts, cursor.ts, cursor.rowid, before + 1) as MessageRow[];
  const afterRows = db.prepare(`
    SELECT ${messageColumns} ${messageJoin}
    WHERE m.bufferId = ?
      AND (m.ts > ? OR (m.ts = ? AND m.rowid > ?))
    ORDER BY m.ts ASC, m.rowid ASC LIMIT ?
  `).all(cursor.bufferId, cursor.ts, cursor.ts, cursor.rowid, after) as MessageRow[];
  return hydrateMessages(db, [...beforeRows.reverse(), ...afterRows]);
};

export const searchMessages = (db: DatabaseSync, networkId: string, target: string, query: string, limit = 10) => {
  const bufferId = getMessageBufferId(db, networkId, target);
  if (!bufferId || query.trim().length === 0) {
    return [];
  }
  const rows = db.prepare(`
    SELECT
      ${messageColumns},
      bm25(messages_fts, 1.2, 1.0) AS score
    FROM messages_fts
    JOIN messages AS m ON m.rowid = messages_fts.rowid
    JOIN buffers AS b ON b.id = m.bufferId
    WHERE messages_fts MATCH ? AND m.bufferId = ?
    ORDER BY score ASC, m.ts ASC, m.rowid ASC
    LIMIT ?
  `).all(query, bufferId, limit) as Array<MessageRow & { score: number }>;
  const messages = hydrateMessages(db, rows);
  return messages.map((message, index) => ({ message, score: rows[index]!.score }));
};

export const listRecentMessages = (db: DatabaseSync, limit = 200) => {
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    ORDER BY m.ts DESC, m.rowid DESC
    LIMIT ?
  `).all(limit) as MessageRow[];
  return hydrateMessages(db, rows).reverse();
};

const selectMessages = (db: DatabaseSync, bufferId: string, limit?: number) => {
  const limitClause = typeof limit === 'number' ? '\n    LIMIT ?' : '';
  const args = typeof limit === 'number' ? [bufferId, limit] : [bufferId];
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE m.bufferId = ?
    ORDER BY m.ts DESC, m.rowid DESC${limitClause}
  `).all(...args) as MessageRow[];
  return hydrateMessages(db, rows).reverse();
};

const selectMessagePage = (
  db: DatabaseSync,
  bufferId: string,
  limit: number,
  before: MessageCursor | null,
): MessagePage => {
  const beforeClause = before ? '\n    AND (m.ts < ? OR (m.ts = ? AND m.rowid < ?))' : '';
  const args = before
    ? [bufferId, before.ts, before.ts, before.rowid, limit + 1]
    : [bufferId, limit + 1];
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE m.bufferId = ?${beforeClause}
    ORDER BY m.ts DESC, m.rowid DESC
    LIMIT ?
  `).all(...args) as MessageRow[];
  return {
    messages: hydrateMessages(db, rows.length > limit ? rows.slice(0, limit) : rows).reverse(),
    hasMore: rows.length > limit,
  };
};
