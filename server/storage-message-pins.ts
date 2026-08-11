import type { SqliteDb } from './storage-sqlite.js';
import type { MessageRow } from './storage-types.js';
import {
  hydrateMessages,
  messageColumns,
  messageJoin,
  type MessageLookup,
} from './storage-message-shared.js';

export const listPinnedMessages = (db: SqliteDb, bufferId: string) => {
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE m.bufferId = ? AND m.pinnedAt IS NOT NULL
    ORDER BY m.ts ASC, m.rowid ASC
  `).all(bufferId) as MessageRow[];
  return hydrateMessages(db, rows);
};

export const setMessagePinned = (
  db: SqliteDb,
  messageId: string,
  pinned: boolean,
  lookup: MessageLookup,
  now = Date.now(),
) => {
  if (pinned) {
    db.prepare(`
      UPDATE messages
      SET pinnedAt = coalesce(pinnedAt, ?)
      WHERE id = ?
    `).run(now, messageId);
  } else {
    db.prepare('UPDATE messages SET pinnedAt = NULL WHERE id = ?').run(messageId);
  }
  return lookup(messageId);
};
