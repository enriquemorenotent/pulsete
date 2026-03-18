import type { DatabaseSync } from 'node:sqlite';
import type { MessageInput, MessageRow } from './storage-types.js';
import { toMessage } from './storage-utils.js';

export const appendMessage = (db: DatabaseSync, userId: string, input: MessageInput, lookup: MessageLookup) => {
  db.prepare(
    `INSERT INTO messages
       (id, userId, networkId, target, nick, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    userId,
    input.networkId,
    input.target,
    input.nick,
    input.body,
    input.kind,
    input.self ? 1 : 0,
    input.ts
  );
  return lookup(userId, input.id)!;
};

export const getMessageById = (db: DatabaseSync, userId: string, messageId: string) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages WHERE userId = ? AND id = ?';
  const row = db.prepare(sql).get(userId, messageId) as MessageRow | undefined;
  return row ? toMessage(row) : null;
};

export const listMessages = (db: DatabaseSync, userId: string, networkId: string, target: string, limit = 200) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages WHERE userId = ? AND networkId = ? AND target = ? ORDER BY ts DESC LIMIT ?';
  const rows = db.prepare(sql).all(userId, networkId, target, limit) as MessageRow[];
  return rows.reverse().map(toMessage);
};

export const listRecentMessages = (db: DatabaseSync, userId: string, limit = 200) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages WHERE userId = ? ORDER BY ts DESC LIMIT ?';
  const rows = db.prepare(sql).all(userId, limit) as MessageRow[];
  return rows.reverse().map(toMessage);
};

type MessageLookup = (userId: string, messageId: string) => MessageInput | null;
