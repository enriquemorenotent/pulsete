import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { NetworkProfile } from '../shared/protocol.js';
import { isEncryptedSecret } from './network-secret.js';
import { badRequest, notFound } from './app-error.js';
import type { SecretBox } from './network-secret.js';
import type { NetworkCountRow, NetworkInput, NetworkRow, RuntimeNetworkProfile } from './storage-types.js';
import {
  defaultNetworkTemplates,
  encryptNetworkPassword,
  toNetworkProfile,
  toRuntimeNetworkProfile,
} from './storage-utils.js';

const networkColumns =
  'id, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin';

export const listNetworks = (db: DatabaseSync): NetworkProfile[] => {
  const sql = `SELECT ${networkColumns} FROM networks ORDER BY managerHidden ASC, favorite DESC, createdAt ASC`;
  return (db.prepare(sql).all() as NetworkRow[]).map(toNetworkProfile);
};

export const ensureDefaultNetworks = (db: DatabaseSync, saveNetwork: SaveNetwork) => {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM networks').get() as NetworkCountRow;
  if (existing.count > 0) {
    return;
  }
  for (const network of defaultNetworkTemplates()) {
    saveNetwork(network);
  }
};

export const getNetwork = (db: DatabaseSync, networkId: string): NetworkProfile | null => {
  const row = getNetworkRow(db, networkId);
  return row ? toNetworkProfile(row) : null;
};

export const getRuntimeNetwork = (
  db: DatabaseSync,
  networkId: string,
  secretBox: SecretBox
): RuntimeNetworkProfile | null => {
  const row = getNetworkRow(db, networkId);
  return row ? toRuntimeNetworkProfile(row, secretBox) : null;
};

export const upsertNetwork = (
  db: DatabaseSync,
  input: NetworkInput,
  secretBox: SecretBox
): NetworkProfile => {
  const id = input.id ?? randomUUID();
  const now = Date.now();
  const existing = input.id ? (getNetworkRow(db, input.id) ?? null) : null;
  const template = validateTemplateRelationship(db, input, existing);
  const storedPassword = resolveStoredPassword(input, secretBox, existing, template);
  db.prepare(
    `INSERT INTO networks
       (id, templateId, managerHidden, name, host, port, tls, nick, altNicks, username, realName, password, favorite, autoJoin, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    storedPassword,
    input.favorite ? 1 : 0,
    JSON.stringify(input.autoJoin ?? []),
    now,
    now
  );
  const profile = getNetwork(db, id);
  if (!profile) {
    throw notFound('Network not found');
  }
  return profile;
};

export const deleteNetwork = (db: DatabaseSync, networkId: string) => {
  db.prepare('DELETE FROM networks WHERE id = ? OR templateId = ?').run(networkId, networkId);
};

export const migrateLegacyNetworkPasswords = (db: DatabaseSync, secretBox: SecretBox) => {
  const rows = db.prepare('SELECT id, password FROM networks WHERE password IS NOT NULL')
    .all() as Array<{ id: string; password: string }>;
  for (const row of rows) {
    if (!secretBox.isEncrypted(row.password)) {
      db.prepare('UPDATE networks SET password = ? WHERE id = ?')
        .run(secretBox.encrypt(row.password), row.id);
    }
  }
};

export const hasEncryptedNetworkPasswords = (db: DatabaseSync) =>
  (db.prepare('SELECT password FROM networks WHERE password IS NOT NULL').all() as Array<{ password: string }>)
    .some((row) => isEncryptedSecret(row.password));

const getNetworkRow = (db: DatabaseSync, networkId: string) => {
  const sql = `SELECT ${networkColumns} FROM networks WHERE id = ?`;
  return db.prepare(sql).get(networkId) as NetworkRow | undefined;
};

const getTemplateRow = (db: DatabaseSync, templateId: string) => {
  const sql = `SELECT ${networkColumns} FROM networks WHERE id = ?`;
  return db.prepare(sql).get(templateId) as NetworkRow | undefined;
};

const validateTemplateRelationship = (
  db: DatabaseSync,
  input: NetworkInput,
  existing: NetworkRow | null
) => {
  const templateId = input.templateId ?? null;
  const template = templateId ? getTemplateRow(db, templateId) : null;
  if (existing && (existing.managerHidden !== (input.managerHidden ? 1 : 0) || existing.templateId !== templateId)) {
    throw badRequest('Network template relationship cannot be changed after creation');
  }
  if (input.managerHidden) {
    if (!template || template.managerHidden) {
      throw badRequest('Connection instances must reference an existing saved network');
    }
    return template;
  }
  if (templateId) {
    throw badRequest('Saved networks cannot reference a template');
  }
  return null;
};

const resolveStoredPassword = (
  input: NetworkInput,
  secretBox: SecretBox,
  existing: NetworkRow | null,
  template: NetworkRow | null
) => {
  if (input.clearPassword) {
    return null;
  }
  if (input.password !== undefined) {
    if (input.password.length === 0) {
      return existing?.password ?? template?.password ?? null;
    }
    return encryptNetworkPassword(input.password, secretBox);
  }
  if (existing?.password) {
    return existing.password;
  }
  return template?.password ?? null;
};

type SaveNetwork = (input: NetworkInput) => NetworkProfile;
