import { randomUUID } from 'node:crypto';
import type { NickEmojiState } from '../shared/protocol.js';
import type { SqliteDb } from './storage-sqlite.js';
import type { NickEmojiInput, NickEmojiRow } from './storage-types.js';
import { toNickEmojiState } from './storage-utils.js';

export const listNickEmojis = (db: SqliteDb, networkId?: string): NickEmojiState[] => {
  const sql = networkId
    ? `SELECT id, networkId, nick, emoji, createdAt, updatedAt
       FROM nick_emoji_tags
       WHERE networkId = ?
       ORDER BY nick COLLATE NOCASE ASC, createdAt ASC`
    : `SELECT id, networkId, nick, emoji, createdAt, updatedAt
       FROM nick_emoji_tags
       ORDER BY networkId ASC, nick COLLATE NOCASE ASC, createdAt ASC`;
  const rows = networkId
    ? db.prepare(sql).all(networkId)
    : db.prepare(sql).all();
  return (rows as NickEmojiRow[]).map(toNickEmojiState);
};

export const getNickEmoji = (db: SqliteDb, nickEmojiId: string): NickEmojiState | null => {
  const row = db.prepare(
    `SELECT id, networkId, nick, emoji, createdAt, updatedAt
     FROM nick_emoji_tags
     WHERE id = ?`,
  ).get(nickEmojiId) as NickEmojiRow | undefined;
  return row ? toNickEmojiState(row) : null;
};

export const getNickEmojiByNick = (db: SqliteDb, networkId: string, nick: string): NickEmojiState | null => {
  const row = db.prepare(
    `SELECT id, networkId, nick, emoji, createdAt, updatedAt
     FROM nick_emoji_tags
     WHERE networkId = ? AND nick = ? COLLATE NOCASE`,
  ).get(networkId, nick) as NickEmojiRow | undefined;
  return row ? toNickEmojiState(row) : null;
};

export const upsertNickEmoji = (db: SqliteDb, input: NickEmojiInput) => {
  const existing = (input.id ? getNickEmoji(db, input.id) : null)
    ?? getNickEmojiByNick(db, input.networkId, input.nick);
  const id = existing?.id ?? input.id ?? randomUUID();
  const now = Date.now();
  if (existing) {
    db.prepare('UPDATE nick_emoji_tags SET nick = ?, emoji = ?, updatedAt = ? WHERE id = ?')
      .run(input.nick, input.emoji, now, existing.id);
    return getNickEmoji(db, existing.id)!;
  }
  db.prepare(
    `INSERT INTO nick_emoji_tags (id, networkId, nick, emoji, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(networkId, nick) DO UPDATE SET
       nick = excluded.nick,
       emoji = excluded.emoji,
       updatedAt = excluded.updatedAt`,
  ).run(id, input.networkId, input.nick, input.emoji, now, now);
  return getNickEmojiByNick(db, input.networkId, input.nick)!;
};

export const removeNickEmoji = (db: SqliteDb, nickEmojiId: string) => {
  const existing = getNickEmoji(db, nickEmojiId);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM nick_emoji_tags WHERE id = ?').run(nickEmojiId);
  return existing;
};

export const removeNickEmojiByNick = (db: SqliteDb, networkId: string, nick: string) => {
  const existing = getNickEmojiByNick(db, networkId, nick);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM nick_emoji_tags WHERE id = ?').run(existing.id);
  return existing;
};
