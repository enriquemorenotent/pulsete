import { randomUUID } from 'node:crypto';
import type { NickEmojiState } from '../shared/protocol-chat.js';
import {
  identityFromNick,
  normalizeNetworkUserIdentity,
  type NetworkUserIdentity,
} from '../shared/user-identity.js';
import type { SqliteDb } from './storage-sqlite.js';
import type { NickEmojiInput, NickEmojiRow } from './storage-types.js';
import { toNickEmojiState } from './storage-utils.js';

const nickEmojiColumns = 'id, networkId, nick, identityKind, identityValue, emoji, createdAt, updatedAt';

export const listNickEmojis = (db: SqliteDb, networkId?: string): NickEmojiState[] => {
  const sql = networkId
    ? `SELECT ${nickEmojiColumns}
       FROM nick_emoji_tags
       WHERE networkId = ?
       ORDER BY nick COLLATE NOCASE ASC, identityKind ASC, identityValue ASC, createdAt ASC`
    : `SELECT ${nickEmojiColumns}
       FROM nick_emoji_tags
       ORDER BY networkId ASC, nick COLLATE NOCASE ASC, identityKind ASC, identityValue ASC, createdAt ASC`;
  const rows = networkId
    ? db.prepare(sql).all(networkId)
    : db.prepare(sql).all();
  return (rows as NickEmojiRow[]).map(toNickEmojiState);
};

export const getNickEmoji = (db: SqliteDb, nickEmojiId: string): NickEmojiState | null => {
  const row = db.prepare(
    `SELECT ${nickEmojiColumns}
     FROM nick_emoji_tags
     WHERE id = ?`,
  ).get(nickEmojiId) as NickEmojiRow | undefined;
  return row ? toNickEmojiState(row) : null;
};

export const getNickEmojiByNick = (db: SqliteDb, networkId: string, nick: string): NickEmojiState | null => {
  const row = db.prepare(
    `SELECT ${nickEmojiColumns}
     FROM nick_emoji_tags
     WHERE networkId = ? AND identityKind = 'nick' AND nick = ? COLLATE NOCASE`,
  ).get(networkId, nick) as NickEmojiRow | undefined;
  return row ? toNickEmojiState(row) : null;
};

export const getNickEmojiByIdentity = (
  db: SqliteDb,
  networkId: string,
  identity: NetworkUserIdentity,
): NickEmojiState | null => {
  const normalizedIdentity = normalizeNetworkUserIdentity(identity);
  if (!normalizedIdentity) {
    return null;
  }
  const row = db.prepare(
    `SELECT ${nickEmojiColumns}
     FROM nick_emoji_tags
     WHERE networkId = ? AND identityKind = ? AND identityValue = ?`,
  ).get(networkId, normalizedIdentity.kind, normalizedIdentity.value) as NickEmojiRow | undefined;
  return row ? toNickEmojiState(row) : null;
};

export const upsertNickEmoji = (db: SqliteDb, input: NickEmojiInput) => {
  const identity = normalizeNetworkUserIdentity(input.identity) ?? identityFromNick(input.nick);
  const existing = (input.id ? getNickEmoji(db, input.id) : null)
    ?? getNickEmojiByIdentity(db, input.networkId, identity);
  const legacyNickMatch = existing ? null : getNickEmojiByNick(db, input.networkId, input.nick);
  const existingEntry = existing ?? legacyNickMatch;
  const id = existingEntry?.id ?? input.id ?? randomUUID();
  const now = Date.now();
  if (existingEntry) {
    db.prepare(`
      UPDATE nick_emoji_tags
      SET nick = ?, identityKind = ?, identityValue = ?, emoji = ?, updatedAt = ?
      WHERE id = ?
    `).run(input.nick, identity.kind, identity.value, input.emoji, now, existingEntry.id);
    return getNickEmoji(db, existingEntry.id)!;
  }
  db.prepare(
    `INSERT INTO nick_emoji_tags (id, networkId, nick, identityKind, identityValue, emoji, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(networkId, identityKind, identityValue) DO UPDATE SET
       nick = excluded.nick,
       identityKind = excluded.identityKind,
       identityValue = excluded.identityValue,
       emoji = excluded.emoji,
       updatedAt = excluded.updatedAt`,
  ).run(id, input.networkId, input.nick, identity.kind, identity.value, input.emoji, now, now);
  return getNickEmojiByIdentity(db, input.networkId, identity)!;
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

export const removeNickEmojiByIdentity = (
  db: SqliteDb,
  networkId: string,
  nick: string,
  identity: NetworkUserIdentity | null | undefined,
) => {
  const normalizedIdentity = normalizeNetworkUserIdentity(identity);
  const existing = normalizedIdentity
    ? getNickEmojiByIdentity(db, networkId, normalizedIdentity) ?? getNickEmojiByNick(db, networkId, nick)
    : getNickEmojiByNick(db, networkId, nick);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM nick_emoji_tags WHERE id = ?').run(existing.id);
  return existing;
};
