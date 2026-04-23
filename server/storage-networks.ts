import { randomUUID } from 'node:crypto';
import type { SqliteDb } from './storage-sqlite.js';
import {
  defaultNetworkAuthMethod,
  resolveNetworkAuthTarget,
  type StoredNetworkProfile,
} from '../shared/network-model.js';
import {
  listNetworkAltNicks,
  listNetworkAutoJoinChannels,
  listNetworkHistoricalSelfNicks,
  replaceNetworkAltNicks,
  replaceNetworkAutoJoinChannels,
  replaceNetworkHistoricalSelfNicks,
} from './storage-owned-lists.js';
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
  'id, templateId, managerHidden, name, host, port, tls, nick, username, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt';

export const listNetworks = (db: SqliteDb): StoredNetworkProfile[] => {
  const sql = `SELECT ${networkColumns} FROM networks ORDER BY managerHidden ASC, favorite DESC, createdAt ASC`;
  return (db.prepare(sql).all() as NetworkRow[]).map((row) => toNetworkProfile(row, readNetworkLists(db, row.id)));
};

export const ensureDefaultNetworks = (db: SqliteDb, saveNetwork: SaveNetwork) => {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM networks').get() as NetworkCountRow;
  if (existing.count > 0) {
    return;
  }
  for (const network of defaultNetworkTemplates()) {
    saveNetwork(network);
  }
};

export const getNetwork = (db: SqliteDb, networkId: string): StoredNetworkProfile | null => {
  const row = getNetworkRow(db, networkId);
  return row ? toNetworkProfile(row, readNetworkLists(db, row.id)) : null;
};

export const getRuntimeNetwork = (
  db: SqliteDb,
  networkId: string,
  secretBox: SecretBox
): RuntimeNetworkProfile | null => {
  const row = getNetworkRow(db, networkId);
  return row ? toRuntimeNetworkProfile(row, secretBox, readNetworkLists(db, row.id)) : null;
};

export const upsertNetwork = (
  db: SqliteDb,
  input: NetworkInput,
  secretBox: SecretBox
): StoredNetworkProfile => {
  const id = input.id ?? randomUUID();
  const now = Date.now();
  const existing = input.id ? (getNetworkRow(db, input.id) ?? null) : null;
  const template = validateTemplateRelationship(db, input, existing);
  const storedPassword = resolveStoredPassword(input, secretBox, existing, template);
  const storedAuthMethod = resolveStoredAuthMethod(input, existing, template);
  const storedAuthTarget = resolveStoredAuthTarget(input, existing, template);
  const storedAuthAccount = resolveStoredAuthAccount(input, existing, template);
  requireStoredPasswordForAuthMethod(storedAuthMethod, storedPassword);
  db.prepare(
    `INSERT INTO networks
       (id, templateId, managerHidden, name, host, port, tls, nick, username, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       templateId = excluded.templateId,
       managerHidden = excluded.managerHidden,
       name = excluded.name,
       host = excluded.host,
       port = excluded.port,
       tls = excluded.tls,
       nick = excluded.nick,
       username = excluded.username,
       realName = excluded.realName,
       password = excluded.password,
       authMethod = excluded.authMethod,
       authTarget = excluded.authTarget,
       authAccount = excluded.authAccount,
       favorite = excluded.favorite,
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
    input.username,
    input.realName,
    storedPassword,
    storedAuthMethod,
    storedAuthTarget,
    storedAuthAccount,
    input.favorite ? 1 : 0,
    now,
    now
  );
  replaceNetworkAltNicks(db, id, input.altNicks ?? []);
  replaceNetworkHistoricalSelfNicks(db, id, input.historicalSelfNicks ?? []);
  replaceNetworkAutoJoinChannels(db, id, input.autoJoin ?? []);
  const profile = getNetwork(db, id);
  if (!profile) {
    throw notFound('Network not found');
  }
  return profile;
};

export const deleteNetwork = (db: SqliteDb, networkId: string) => {
  db.prepare('DELETE FROM networks WHERE id = ? OR templateId = ?').run(networkId, networkId);
};

export const hasEncryptedNetworkPasswords = (db: SqliteDb) =>
  (db.prepare('SELECT password FROM networks WHERE password IS NOT NULL').all() as Array<{ password: string }>)
    .some((row) => isEncryptedSecret(row.password));

const getNetworkRow = (db: SqliteDb, networkId: string) =>
  db.prepare(`SELECT ${networkColumns} FROM networks WHERE id = ?`).get(networkId) as NetworkRow | undefined;

const getTemplateRow = (db: SqliteDb, templateId: string) =>
  db.prepare(`SELECT ${networkColumns} FROM networks WHERE id = ?`).get(templateId) as NetworkRow | undefined;

const readNetworkLists = (db: SqliteDb, networkId: string) => ({
  altNicks: listNetworkAltNicks(db, networkId),
  historicalSelfNicks: listNetworkHistoricalSelfNicks(db, networkId),
  autoJoin: listNetworkAutoJoinChannels(db, networkId),
});

const validateTemplateRelationship = (
  db: SqliteDb,
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

const resolveStoredAuthMethod = (
  input: NetworkInput,
  existing: NetworkRow | null,
  template: NetworkRow | null
) => {
  if (input.authMethod !== undefined) {
    return input.authMethod;
  }
  const inheritedAuthMethod = existing?.authMethod ?? template?.authMethod;
  if (input.password !== undefined && input.password.length > 0 && (!inheritedAuthMethod || inheritedAuthMethod === 'none')) {
    return defaultNetworkAuthMethod(true);
  }
  if (existing?.authMethod) {
    return existing.authMethod;
  }
  if (template?.authMethod) {
    return template.authMethod;
  }
  const hasSecret = input.password !== undefined
    ? input.password.length > 0
    : Boolean(existing?.password ?? template?.password);
  return defaultNetworkAuthMethod(hasSecret);
};

const resolveStoredAuthTarget = (
  input: NetworkInput,
  existing: NetworkRow | null,
  template: NetworkRow | null
) => {
  if (input.authTarget !== undefined) {
    return resolveNetworkAuthTarget(input.authTarget);
  }
  if (existing?.authTarget) {
    return resolveNetworkAuthTarget(existing.authTarget);
  }
  return resolveNetworkAuthTarget(template?.authTarget);
};

const resolveStoredAuthAccount = (
  input: NetworkInput,
  existing: NetworkRow | null,
  template: NetworkRow | null
) => {
  if (input.authAccount !== undefined) {
    return input.authAccount.trim();
  }
  if (existing) {
    return existing.authAccount;
  }
  if (template) {
    return template.authAccount;
  }
  return '';
};

const requireStoredPasswordForAuthMethod = (authMethod: NetworkRow['authMethod'], storedPassword: string | null) => {
  if (authMethod !== 'none' && !storedPassword) {
    throw badRequest('Selected authentication method requires a saved password');
  }
};

type SaveNetwork = (input: NetworkInput) => StoredNetworkProfile;
