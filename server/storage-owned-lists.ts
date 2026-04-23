import type { SqliteDb } from './storage-sqlite.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';

type OwnedListSpec = {
  table: string;
  ownerColumn: string;
  valueColumn: string;
  keyColumn: string;
};

const readOwnedValues = <T extends string>(
  db: SqliteDb,
  spec: OwnedListSpec,
  ownerId: string,
) => (
  db.prepare(
    `SELECT ${spec.valueColumn} AS value
     FROM ${spec.table}
     WHERE ${spec.ownerColumn} = ?
     ORDER BY position ASC`
  ).all(ownerId) as Array<{ value: T }>
).map((row) => row.value);

const replaceOwnedValues = (
  db: SqliteDb,
  spec: OwnedListSpec,
  ownerId: string,
  values: readonly string[],
) => {
  db.prepare(`DELETE FROM ${spec.table} WHERE ${spec.ownerColumn} = ?`).run(ownerId);
  const insert = db.prepare(
    `INSERT INTO ${spec.table}
       (${spec.ownerColumn}, position, ${spec.valueColumn}, ${spec.keyColumn})
     VALUES (?, ?, ?, ?)`
  );
  normalizeOwnedValues(values).forEach((value, position) => {
    insert.run(ownerId, position, value, normalizeIrcIdentifier(value));
  });
};

const normalizeOwnedValues = (values: readonly string[]) => {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeIrcIdentifier(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
};

const networkAltNickSpec: OwnedListSpec = {
  table: 'network_alt_nicks',
  ownerColumn: 'networkId',
  valueColumn: 'nick',
  keyColumn: 'nickKey',
};

const networkHistoricalSelfNickSpec: OwnedListSpec = {
  table: 'network_historical_self_nicks',
  ownerColumn: 'networkId',
  valueColumn: 'nick',
  keyColumn: 'nickKey',
};

const networkAutoJoinSpec: OwnedListSpec = {
  table: 'network_auto_join_channels',
  ownerColumn: 'networkId',
  valueColumn: 'channel',
  keyColumn: 'channelKey',
};

const bufferSelfNickAliasSpec: OwnedListSpec = {
  table: 'buffer_self_nick_aliases',
  ownerColumn: 'bufferId',
  valueColumn: 'nick',
  keyColumn: 'nickKey',
};

export const listNetworkAltNicks = (db: SqliteDb, networkId: string) =>
  readOwnedValues(db, networkAltNickSpec, networkId);

export const replaceNetworkAltNicks = (db: SqliteDb, networkId: string, values: readonly string[]) => {
  replaceOwnedValues(db, networkAltNickSpec, networkId, values);
};

export const listNetworkHistoricalSelfNicks = (db: SqliteDb, networkId: string) =>
  readOwnedValues(db, networkHistoricalSelfNickSpec, networkId);

export const replaceNetworkHistoricalSelfNicks = (
  db: SqliteDb,
  networkId: string,
  values: readonly string[],
) => {
  replaceOwnedValues(db, networkHistoricalSelfNickSpec, networkId, values);
};

export const listNetworkAutoJoinChannels = (db: SqliteDb, networkId: string) =>
  readOwnedValues(db, networkAutoJoinSpec, networkId);

export const replaceNetworkAutoJoinChannels = (
  db: SqliteDb,
  networkId: string,
  values: readonly string[],
) => {
  replaceOwnedValues(db, networkAutoJoinSpec, networkId, values);
};

export const listBufferSelfNickAliases = (db: SqliteDb, bufferId: string) =>
  readOwnedValues(db, bufferSelfNickAliasSpec, bufferId);

export const replaceBufferSelfNickAliases = (
  db: SqliteDb,
  bufferId: string,
  values: readonly string[],
) => {
  replaceOwnedValues(db, bufferSelfNickAliasSpec, bufferId, values);
};
