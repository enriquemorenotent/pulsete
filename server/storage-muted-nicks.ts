import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { MutedNickState } from '../shared/protocol.js';
import { findMutedNickByNick } from '../shared/muted-nicks.js';
import type { MutedNickInput, MutedNickRow } from './storage-types.js';
import { toMutedNickState } from './storage-utils.js';

export const listMutedNicks = (db: DatabaseSync, networkId?: string): MutedNickState[] => {
  const sql = networkId
    ? `SELECT id, networkId, nick, createdAt, updatedAt
       FROM muted_nicks
       WHERE networkId = ?
       ORDER BY nick COLLATE NOCASE ASC, createdAt ASC`
    : `SELECT id, networkId, nick, createdAt, updatedAt
       FROM muted_nicks
       ORDER BY networkId ASC, nick COLLATE NOCASE ASC, createdAt ASC`;
  const rows = networkId
    ? db.prepare(sql).all(networkId)
    : db.prepare(sql).all();
  return (rows as MutedNickRow[]).map(toMutedNickState);
};

export const getMutedNick = (db: DatabaseSync, mutedNickId: string): MutedNickState | null => {
  const row = db.prepare(
    'SELECT id, networkId, nick, createdAt, updatedAt FROM muted_nicks WHERE id = ?',
  ).get(mutedNickId) as MutedNickRow | undefined;
  return row ? toMutedNickState(row) : null;
};

export const getMutedNickByNick = (db: DatabaseSync, networkId: string, nick: string): MutedNickState | null =>
  findMutedNickByNick(listMutedNicks(db, networkId), networkId, nick);

export const upsertMutedNick = (db: DatabaseSync, input: MutedNickInput) => {
  const existing = (input.id ? getMutedNick(db, input.id) : null) ?? getMutedNickByNick(db, input.networkId, input.nick);
  if (existing) {
    db.prepare('UPDATE muted_nicks SET updatedAt = ? WHERE id = ?').run(Date.now(), existing.id);
    return getMutedNick(db, existing.id)!;
  }

  const id = input.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO muted_nicks (id, networkId, nick, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       networkId = excluded.networkId,
       nick = excluded.nick,
       updatedAt = excluded.updatedAt`,
  ).run(id, input.networkId, input.nick, now, now);
  return getMutedNick(db, id)!;
};

export const removeMutedNick = (db: DatabaseSync, mutedNickId: string) => {
  const existing = getMutedNick(db, mutedNickId);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM muted_nicks WHERE id = ?').run(mutedNickId);
  return existing;
};
