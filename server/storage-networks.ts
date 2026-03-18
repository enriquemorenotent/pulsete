import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { NetworkProfile } from '../shared/protocol.js';
import type { NetworkCountRow, NetworkInput, NetworkRow } from './storage-types.js';
import { defaultNetworkTemplates, toNetworkProfile } from './storage-utils.js';

const networkColumns =
  'id, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin';

export const listNetworks = (db: DatabaseSync, userId: string): NetworkProfile[] => {
  const sql = `SELECT ${networkColumns} FROM networks WHERE userId = ? ORDER BY managerHidden ASC, favorite DESC, createdAt ASC`;
  return (db.prepare(sql).all(userId) as NetworkRow[]).map(toNetworkProfile);
};

export const ensureDefaultNetworks = (db: DatabaseSync, userId: string, username: string, saveNetwork: SaveNetwork) => {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM networks WHERE userId = ?')
    .get(userId) as NetworkCountRow;
  if (existing.count > 0) {
    return;
  }
  for (const network of defaultNetworkTemplates(username)) {
    saveNetwork(userId, network);
  }
};

export const getNetwork = (db: DatabaseSync, userId: string, networkId: string): NetworkProfile | null => {
  const sql = `SELECT ${networkColumns} FROM networks WHERE userId = ? AND id = ?`;
  const row = db.prepare(sql).get(userId, networkId) as NetworkRow | undefined;
  return row ? toNetworkProfile(row) : null;
};

export const upsertNetwork = (db: DatabaseSync, userId: string, input: NetworkInput): NetworkProfile => {
  const id = input.id ?? randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO networks
       (id, userId, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       templateId = excluded.templateId,
       managerHidden = excluded.managerHidden,
       name = excluded.name,
       host = excluded.host,
       port = excluded.port,
       tls = excluded.tls,
       nick = excluded.nick,
       altNicks = excluded.altNicks,
       username = excluded.username,
       realName = excluded.realName,
       password = excluded.password,
       favorite = excluded.favorite,
       autoJoin = excluded.autoJoin,
       updatedAt = excluded.updatedAt`
  ).run(
    id,
    userId,
    input.templateId ?? null,
    input.managerHidden ? 1 : 0,
    input.name,
    input.host,
    input.port,
    input.tls ? 1 : 0,
    input.nick,
    JSON.stringify(input.altNicks ?? []),
    input.username,
    input.realName,
    input.password ?? null,
    input.favorite ? 1 : 0,
    JSON.stringify(input.autoJoin ?? []),
    now,
    now
  );
  return { ...input, id, templateId: input.templateId ?? null, managerHidden: Boolean(input.managerHidden) };
};

export const deleteNetwork = (db: DatabaseSync, userId: string, networkId: string) => {
  db.prepare('DELETE FROM networks WHERE userId = ? AND (id = ? OR templateId = ?)').run(userId, networkId, networkId);
};

type SaveNetwork = (userId: string, input: NetworkInput) => NetworkProfile;
