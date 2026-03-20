import type { DatabaseSync } from 'node:sqlite';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import type { MessageInput, MessageRow } from './storage-types.js';
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
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages WHERE networkId = ? ORDER BY ts DESC, rowid DESC';
  const rows = db.prepare(sql).all(networkId) as MessageRow[];
  const matches: MessageRow[] = [];
  for (const row of rows) {
    if (!isSameIrcIdentifier(row.target, target)) {
      continue;
    }
    matches.push(row);
    if (matches.length >= limit) {
      break;
    }
  }
  return matches.reverse().map(toMessage);
};

export const listRecentMessages = (db: DatabaseSync, limit = 200) => {
  const sql = 'SELECT id, networkId, target, nick, body, kind, self, ts FROM messages ORDER BY ts DESC, rowid DESC LIMIT ?';
  const rows = db.prepare(sql).all(limit) as MessageRow[];
  return rows.reverse().map(toMessage);
};

type MessageLookup = (messageId: string) => MessageInput | null;
