import { randomUUID } from 'node:crypto';
import type { SqliteDb } from './storage-sqlite.js';
import type { MutedNickState } from '../shared/protocol-chat.js';
import { findMutedNickByIdentity, findMutedNickByNick } from '../shared/muted-nicks.js';
import { identityFromNick, normalizeNetworkUserIdentity, type NetworkUserIdentity } from '../shared/user-identity.js';
import type { MutedNickInput, MutedNickRow } from './storage-types.js';
import { toMutedNickState } from './storage-utils.js';

const mutedNickColumns = 'id, networkId, nick, identityKind, identityValue, createdAt, updatedAt';

export const listMutedNicks = (db: SqliteDb, networkId?: string): MutedNickState[] => {
  const sql = networkId
    ? `SELECT ${mutedNickColumns}
       FROM muted_nicks
       WHERE networkId = ?
       ORDER BY nick COLLATE NOCASE ASC, identityKind ASC, identityValue ASC, createdAt ASC`
    : `SELECT ${mutedNickColumns}
       FROM muted_nicks
       ORDER BY networkId ASC, nick COLLATE NOCASE ASC, identityKind ASC, identityValue ASC, createdAt ASC`;
  const rows = networkId
    ? db.prepare(sql).all(networkId)
    : db.prepare(sql).all();
  return (rows as MutedNickRow[]).map(toMutedNickState);
};

export const getMutedNick = (db: SqliteDb, mutedNickId: string): MutedNickState | null => {
  const row = db.prepare(
    `SELECT ${mutedNickColumns} FROM muted_nicks WHERE id = ?`,
  ).get(mutedNickId) as MutedNickRow | undefined;
  return row ? toMutedNickState(row) : null;
};

export const getMutedNickByNick = (db: SqliteDb, networkId: string, nick: string): MutedNickState | null =>
  findMutedNickByNick(listMutedNicks(db, networkId), networkId, nick);

export const getMutedNickByIdentity = (
  db: SqliteDb,
  networkId: string,
  nick: string,
  identity: NetworkUserIdentity,
): MutedNickState | null =>
  findMutedNickByIdentity(listMutedNicks(db, networkId), { networkId, nick, identity });

export const upsertMutedNick = (db: SqliteDb, input: MutedNickInput) => {
  const identity = normalizeNetworkUserIdentity(input.identity) ?? identityFromNick(input.nick);
  const existing = (input.id ? getMutedNick(db, input.id) : null)
    ?? getMutedNickByIdentity(db, input.networkId, input.nick, identity);
  if (existing) {
    db.prepare(`
      UPDATE muted_nicks
      SET nick = ?, identityKind = ?, identityValue = ?, updatedAt = ?
      WHERE id = ?
    `).run(input.nick, identity.kind, identity.value, Date.now(), existing.id);
    return getMutedNick(db, existing.id)!;
  }

  const id = input.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO muted_nicks (id, networkId, nick, identityKind, identityValue, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       networkId = excluded.networkId,
       nick = excluded.nick,
       identityKind = excluded.identityKind,
       identityValue = excluded.identityValue,
       updatedAt = excluded.updatedAt`,
  ).run(id, input.networkId, input.nick, identity.kind, identity.value, now, now);
  return getMutedNick(db, id)!;
};

export const removeMutedNick = (db: SqliteDb, mutedNickId: string) => {
  const existing = getMutedNick(db, mutedNickId);
  if (!existing) {
    return null;
  }
  db.prepare('DELETE FROM muted_nicks WHERE id = ?').run(mutedNickId);
  return existing;
};
