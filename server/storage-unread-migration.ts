import type { SqliteDb } from './storage-sqlite.js';
import { recordUnreadMessage } from './storage-unread.js';
import type { MessageInput } from './storage-types.js';

const adjustCounts = (row: 'NEW' | 'OLD', sign: '+' | '-') => `UPDATE buffers SET
  unread = unread ${sign} (1 - ${row}.muted),
  priorityUnread = priorityUnread ${sign} ((1 - ${row}.muted) * ${row}.priority)
  WHERE id = ${row}.bufferId;`;

export const migrateUnreadMessages = (db: SqliteDb) => {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'unread_messages'").get()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE unread_messages (
      messageId TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      bufferId TEXT NOT NULL REFERENCES buffers(id) ON DELETE CASCADE,
      messageTs INTEGER NOT NULL,
      messageOrder INTEGER NOT NULL,
      priority INTEGER NOT NULL CHECK(priority IN (0,1)),
      muted INTEGER NOT NULL CHECK(muted IN (0,1))
    );
    CREATE INDEX idx_unread_buffer ON unread_messages(bufferId, muted, messageTs, messageOrder);
    CREATE TRIGGER unread_insert AFTER INSERT ON unread_messages BEGIN ${adjustCounts('NEW', '+')} END;
    CREATE TRIGGER unread_delete AFTER DELETE ON unread_messages BEGIN ${adjustCounts('OLD', '-')} END;
    CREATE TRIGGER unread_update AFTER UPDATE ON unread_messages BEGIN
      ${adjustCounts('OLD', '-')} ${adjustCounts('NEW', '+')} END;
    CREATE TRIGGER unread_move AFTER UPDATE OF bufferId ON messages BEGIN
      UPDATE unread_messages SET bufferId = NEW.bufferId WHERE messageId = NEW.id;
    END;`);
    const buffers = db.prepare('SELECT id, networkId, target, unread, lastReadTs, lastReadMessageId FROM buffers').all() as Array<{
      id: string; networkId: string; target: string; unread: number; lastReadTs: number | null; lastReadMessageId: string | null;
    }>;
    db.exec('UPDATE buffers SET unread = 0, priorityUnread = 0');
    for (const buffer of buffers) {
      const cursor = buffer.lastReadMessageId
        ? db.prepare('SELECT ts, rowid FROM messages WHERE id = ? AND bufferId = ?')
          .get<{ ts: number; rowid: number }>(buffer.lastReadMessageId, buffer.id) : undefined;
      const eligible = "bufferId = ? AND self = 0 AND delivery = 'live'" + (buffer.target === 'server' ? '' : " AND kind <> 'system'");
      const boundary = cursor ? ' AND (ts > ? OR (ts = ? AND rowid > ?))'
        : buffer.lastReadTs !== null ? ' AND ts > ?' : '';
      const args = cursor ? [buffer.id, cursor.ts, cursor.ts, cursor.rowid]
        : buffer.lastReadTs !== null ? [buffer.id, buffer.lastReadTs] : [buffer.id];
      const count = db.prepare(`SELECT count(*) AS n FROM messages WHERE ${eligible}${boundary}`).get<{ n: number }>(...args)!.n;
      // An older merge may have preserved counts that its single cursor cannot describe.
      const fallback = count < buffer.unread;
      const query = db.prepare(`SELECT id, nick, body, kind, self, ts, delivery, senderIdentityKind, senderIdentityValue
        FROM messages WHERE ${eligible}${fallback ? '' : boundary}
        ORDER BY ts ${fallback ? 'DESC' : 'ASC'}, rowid ${fallback ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`);
      const total = fallback ? buffer.unread : count;
      for (let offset = 0; offset < total; offset += 500) {
        const candidates = query.all<MessageInput & {
          senderIdentityKind: 'nick' | 'account' | 'userhost' | null; senderIdentityValue: string | null;
        }>(...(fallback ? [buffer.id] : args), Math.min(500, total - offset), offset);
        if (!candidates.length) break;
        for (const row of candidates) recordUnreadMessage(db, {
          ...row, self: Boolean(row.self), networkId: buffer.networkId, target: buffer.target,
          senderIdentity: row.senderIdentityKind && row.senderIdentityValue ? { kind: row.senderIdentityKind, value: row.senderIdentityValue } : undefined,
        }, buffer.id);
      }
    }
    db.exec(`UPDATE buffers SET unread = (SELECT count(*) FROM unread_messages u WHERE u.bufferId = buffers.id AND muted = 0),
      priorityUnread = (SELECT coalesce(sum(priority),0) FROM unread_messages u WHERE u.bufferId = buffers.id AND muted = 0);`);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
};
