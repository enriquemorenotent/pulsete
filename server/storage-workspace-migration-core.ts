import type { SqliteDb } from './storage-sqlite.js';
import {
  migrateHistoryBatches,
  migrateMessages,
  migrateMutedNicks,
  migrateQueryAliases,
} from './storage-workspace-migration-history.js';

type LegacyNetworkRow = {
  id: string;
  templateId: string | null;
  managerHidden: number;
  connectionClosed: number;
  name: string;
  host: string;
  port: number;
  tls: number;
  nick: string;
  username: string;
  realName: string;
  password: string | null;
  authMethod: string;
  authTarget: string;
  authAccount: string;
  favorite: number;
  createdAt: number;
  updatedAt: number;
};

type BufferRow = {
  id: string;
  networkId: string;
  kind: string;
  target: string;
  targetKey: string;
  isOpen: number;
  unread: number;
  priorityUnread: number;
  lastReadTs: number | null;
  lastReadMessageId: string | null;
  createdAt: number;
  updatedAt: number;
};

type ChannelRow = {
  id: string;
  topic: string;
  users: string;
  createdAt: number;
  updatedAt: number;
};

export const migrateWorkspaceData = (db: SqliteDb) => {
  const networkMap = migrateNetworks(db);
  const bufferMap = migrateBuffers(db, networkMap);
  migrateChannelDetails(db, bufferMap);
  migrateNetworkLists(db, networkMap);
  migrateBufferAliases(db, bufferMap);
  migrateMessages(db, bufferMap);
  migrateHistoryBatches(db, bufferMap);
  migrateQueryAliases(db, networkMap, bufferMap);
  migrateMutedNicks(db, networkMap);
};

const migrateNetworks = (db: SqliteDb) => {
  const rows = db.prepare(`
    SELECT id, templateId, managerHidden, connectionClosed, name, host, port, tls, nick, username,
      realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt
    FROM networks
    ORDER BY managerHidden ASC, createdAt ASC
  `).all() as LegacyNetworkRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const hasHiddenRows = rows.some((row) => row.managerHidden === 1);
  const bufferedNetworkIds = new Set(
    (db.prepare('SELECT DISTINCT networkId FROM buffers').all() as Array<{ networkId: string }>)
      .map((row) => row.networkId),
  );
  const sourceToDestination = new Map<string, string>();
  const destinationRows = new Map<string, { row: LegacyNetworkRow; workspaceOpen: boolean }>();
  for (const row of rows.filter((item) => item.managerHidden !== 1)) {
    sourceToDestination.set(row.id, row.id);
    destinationRows.set(row.id, { row, workspaceOpen: !hasHiddenRows && bufferedNetworkIds.has(row.id) });
  }
  for (const row of rows.filter((item) => item.managerHidden === 1)) {
    const parent = row.templateId ? byId.get(row.templateId) : null;
    const parentIsSaved = parent && parent.managerHidden !== 1;
    const destinationId = parentIsSaved ? parent.id : row.id;
    sourceToDestination.set(row.id, destinationId);
    const entry = destinationRows.get(destinationId) ?? { row, workspaceOpen: false };
    entry.workspaceOpen ||= row.connectionClosed !== 1;
    destinationRows.set(destinationId, entry);
  }
  const insert = db.prepare(`
    INSERT INTO networks_next
      (id, workspaceOpen, name, host, port, tls, nick, username, realName, password, authMethod,
       authTarget, authAccount, favorite, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const { row, workspaceOpen } of destinationRows.values()) {
    insert.run(row.id, workspaceOpen ? 1 : 0, row.name, row.host, row.port, row.tls, row.nick,
      row.username, row.realName, row.password, row.authMethod, row.authTarget, row.authAccount,
      row.favorite, row.createdAt, row.updatedAt);
  }
  return sourceToDestination;
};

const migrateBuffers = (db: SqliteDb, networkMap: Map<string, string>) => {
  const rows = db.prepare(`
    SELECT id, networkId, kind, target, targetKey, isOpen, unread, priorityUnread, lastReadTs,
      lastReadMessageId, createdAt, updatedAt
    FROM buffers
    ORDER BY createdAt ASC, rowid ASC
  `).all() as BufferRow[];
  const bufferMap = new Map<string, string>();
  const destinationByKey = new Map<string, BufferRow>();
  const insert = db.prepare(`
    INSERT INTO buffers_next
      (id, networkId, kind, target, targetKey, isOpen, unread, priorityUnread, lastReadTs,
       lastReadMessageId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE buffers_next SET isOpen = ?, unread = ?, priorityUnread = ?, lastReadTs = ?,
      lastReadMessageId = ?, createdAt = ?, updatedAt = ? WHERE id = ?
  `);
  for (const row of rows) {
    const networkId = networkMap.get(row.networkId) ?? row.networkId;
    const key = `${networkId}:${row.targetKey}`;
    const existing = destinationByKey.get(key);
    if (!existing) {
      const next = { ...row, networkId };
      destinationByKey.set(key, next);
      bufferMap.set(row.id, row.id);
      insert.run(row.id, networkId, row.kind, row.target, row.targetKey, row.isOpen, row.unread,
        row.priorityUnread, row.lastReadTs, row.lastReadMessageId, row.createdAt, row.updatedAt);
      continue;
    }
    const merged = mergeBufferRows(existing, row);
    destinationByKey.set(key, merged);
    bufferMap.set(row.id, existing.id);
    update.run(merged.isOpen, merged.unread, merged.priorityUnread, merged.lastReadTs,
      merged.lastReadMessageId, merged.createdAt, merged.updatedAt, existing.id);
  }
  return bufferMap;
};

const mergeBufferRows = (existing: BufferRow, incoming: BufferRow): BufferRow => {
  const useIncomingRead =
    incoming.lastReadTs !== null
    && (existing.lastReadTs === null || incoming.lastReadTs >= existing.lastReadTs);
  return {
    ...existing,
    isOpen: existing.isOpen || incoming.isOpen ? 1 : 0,
    unread: Math.max(existing.unread, incoming.unread),
    priorityUnread: Math.max(existing.priorityUnread, incoming.priorityUnread),
    lastReadTs: useIncomingRead ? incoming.lastReadTs : existing.lastReadTs,
    lastReadMessageId: useIncomingRead ? incoming.lastReadMessageId : existing.lastReadMessageId,
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
  };
};

const migrateChannelDetails = (db: SqliteDb, bufferMap: Map<string, string>) => {
  const channels = new Map<string, ChannelRow>();
  const rows = db.prepare(
    'SELECT id, topic, users, createdAt, updatedAt FROM channel_details',
  ).all() as ChannelRow[];
  for (const row of rows) {
    const id = bufferMap.get(row.id);
    if (!id) {
      continue;
    }
    const existing = channels.get(id);
    if (!existing || row.updatedAt >= existing.updatedAt) {
      channels.set(id, {
        ...row,
        id,
        createdAt: Math.min(existing?.createdAt ?? row.createdAt, row.createdAt),
      });
    }
  }
  const insert = db.prepare(`
    INSERT INTO channel_details_next (id, topic, users, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of channels.values()) {
    insert.run(row.id, row.topic, row.users, row.createdAt, row.updatedAt);
  }
};

const migrateNetworkLists = (db: SqliteDb, networkMap: Map<string, string>) => {
  copyOwnedList(db, networkMap, 'network_alt_nicks', 'network_alt_nicks_next', 'networkId', 'nick', 'nickKey');
  copyOwnedList(db, networkMap, 'network_historical_self_nicks', 'network_historical_self_nicks_next', 'networkId', 'nick', 'nickKey');
  copyOwnedList(db, networkMap, 'network_auto_join_channels', 'network_auto_join_channels_next', 'networkId', 'channel', 'channelKey');
};

const migrateBufferAliases = (db: SqliteDb, bufferMap: Map<string, string>) => {
  copyOwnedList(db, bufferMap, 'buffer_self_nick_aliases', 'buffer_self_nick_aliases_next', 'bufferId', 'nick', 'nickKey');
};

const copyOwnedList = (
  db: SqliteDb,
  ownerMap: Map<string, string>,
  sourceTable: string,
  nextTable: string,
  ownerColumn: string,
  valueColumn: string,
  keyColumn: string,
) => {
  const seen = new Set<string>();
  const positions = new Map<string, number>();
  const insert = db.prepare(`
    INSERT INTO ${nextTable} (${ownerColumn}, position, ${valueColumn}, ${keyColumn})
    VALUES (?, ?, ?, ?)
  `);
  const rows = db.prepare(`
    SELECT ${ownerColumn} AS ownerId, ${valueColumn} AS value, ${keyColumn} AS key
    FROM ${sourceTable}
    ORDER BY position ASC
  `).all() as Array<{ ownerId: string; value: string; key: string }>;
  for (const row of rows) {
    const ownerId = ownerMap.get(row.ownerId);
    if (!ownerId) {
      continue;
    }
    const key = `${ownerId}:${row.key}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const position = positions.get(ownerId) ?? 0;
    positions.set(ownerId, position + 1);
    insert.run(ownerId, position, row.value, row.key);
  }
};
