import { randomUUID } from 'node:crypto';
import type { SqliteDb } from './storage-sqlite.js';
import type { FriendState } from '../shared/protocol.js';
import type { FriendInput, FriendRow } from './storage-types.js';
import { toFriendState } from './storage-utils.js';

export const listFriends = (db: SqliteDb): FriendState[] =>
  (
    db.prepare('SELECT id, nick, createdAt, updatedAt FROM friends ORDER BY nick COLLATE NOCASE ASC, createdAt ASC')
      .all() as FriendRow[]
  ).map(toFriendState);

export const getFriend = (db: SqliteDb, friendId: string): FriendState | null => {
  const row = db.prepare('SELECT id, nick, createdAt, updatedAt FROM friends WHERE id = ?')
    .get(friendId) as FriendRow | undefined;
  return row ? toFriendState(row) : null;
};

export const getFriendByNick = (db: SqliteDb, nick: string): FriendState | null => {
  const row = db.prepare('SELECT id, nick, createdAt, updatedAt FROM friends WHERE nick = ? COLLATE NOCASE')
    .get(nick) as FriendRow | undefined;
  return row ? toFriendState(row) : null;
};

export const upsertFriend = (db: SqliteDb, input: FriendInput) => {
  const existing = (input.id ? getFriend(db, input.id) : null) ?? getFriendByNick(db, input.nick);
  if (existing) {
    db.prepare('UPDATE friends SET updatedAt = ? WHERE id = ?').run(Date.now(), existing.id);
    return getFriend(db, existing.id)!;
  }

  const id = input.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO friends (id, nick, createdAt, updatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       nick = excluded.nick,
       updatedAt = excluded.updatedAt`
  ).run(id, input.nick, now, now);
  return getFriend(db, id)!;
};

export const removeFriend = (db: SqliteDb, friendId: string) => {
  const existing = getFriend(db, friendId);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM friends WHERE id = ?').run(friendId);
  return existing;
};
