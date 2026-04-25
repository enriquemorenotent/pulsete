import { randomUUID } from 'node:crypto';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import {
  replaceBufferSelfNickAliases,
  replaceNetworkAltNicks,
  replaceNetworkAutoJoinChannels,
  replaceNetworkHistoricalSelfNicks,
} from './storage-owned-lists.js';
import {
  batchConversationsSql,
  copyChannelDetailsSql,
  copyLegacyBatchesSql,
  copyMessagesSql,
  copyNetworksSql,
  copyNormalizedBatchesSql,
  createScratchTablesSql,
  existingBuffersSql,
  insertBufferSql,
  insertConversationMapSql,
  insertLegacyBufferMapSql,
  messageConversationsSql,
} from './storage-normalized-migration-sql.js';
import { dropLegacyMessageSearchArtifacts } from './storage-schema-helpers.js';
import { storageBootstrapSchemaSql } from './storage-bootstrap-schema.js';
import type { SqliteDb, SqliteStatement } from './storage-sqlite.js';

type LegacyListsRow = {
  id: string;
  altNicks: string;
  historicalSelfNicks: string;
  autoJoin: string;
};

type LegacyAliasesRow = {
  id: string;
  selfNickAliases: string;
};

type ExistingBufferRow = {
  id: string;
  networkId: string;
  kind: 'server' | 'channel' | 'query';
  target: string;
  unread: number;
  priorityUnread: number;
  lastReadTs: number | null;
  lastReadMessageId: string | null;
  createdAt: number;
  updatedAt: number;
};

type ConversationRow = {
  networkId: string;
  target: string;
  createdAt: number | null;
};

type MigrationHelpers = {
  tableExists(db: SqliteDb, table: string): boolean;
  tableHasColumn(db: SqliteDb, table: string, column: string): boolean;
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const migrateNormalizedStorage = (db: SqliteDb, helpers: MigrationHelpers) => {
  const networkLists = helpers.tableHasColumn(db, 'networks', 'altNicks')
    ? db.prepare('SELECT id, altNicks, historicalSelfNicks, autoJoin FROM networks').all<LegacyListsRow>()
    : [];
  const bufferAliases = helpers.tableHasColumn(db, 'buffers', 'selfNickAliases')
    ? db.prepare('SELECT id, selfNickAliases FROM buffers').all<LegacyAliasesRow>()
    : [];
  const hasLegacyMessages = helpers.tableHasColumn(db, 'messages', 'networkId');
  const hasLegacyBatchColumns =
    helpers.tableHasColumn(db, 'history_import_batches', 'networkId')
    && helpers.tableHasColumn(db, 'history_import_batches', 'target');

  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    dropNormalizedStorageScratchTables(db);
    dropLegacyMessageSearchArtifacts(db);
    db.exec('DROP TABLE IF EXISTS network_alt_nicks');
    db.exec('DROP TABLE IF EXISTS network_historical_self_nicks');
    db.exec('DROP TABLE IF EXISTS network_auto_join_channels');
    db.exec('DROP TABLE IF EXISTS buffer_self_nick_aliases');
    db.exec(createScratchTablesSql);
    db.exec(copyNetworksSql);

    const insertBuffer = db.prepare(insertBufferSql);
    const insertConversationMap = db.prepare(insertConversationMapSql);
    const insertLegacyBufferMap = db.prepare(insertLegacyBufferMapSql);
    const seenConversations = new Set<string>();
    const existingBuffers = helpers.tableExists(db, 'buffers')
      ? db.prepare(existingBuffersSql).all<ExistingBufferRow>()
      : [];
    for (const buffer of existingBuffers) {
      insertBuffer.run(
        buffer.id,
        buffer.networkId,
        buffer.kind,
        buffer.target,
        normalizeIrcIdentifier(buffer.target),
        1,
        buffer.unread,
        buffer.priorityUnread,
        buffer.lastReadTs,
        buffer.lastReadMessageId,
        buffer.createdAt,
        buffer.updatedAt,
      );
      insertConversationMap.run(buffer.networkId, normalizeIrcIdentifier(buffer.target), buffer.id);
      insertLegacyBufferMap.run(buffer.id, buffer.id);
      seenConversations.add(bufferConversationKey(buffer.networkId, buffer.target));
    }
    addMissingBuffers(
      hasLegacyMessages ? db.prepare(messageConversationsSql).all<ConversationRow>() : [],
      seenConversations,
      insertBuffer,
      insertConversationMap,
    );
    addMissingBuffers(
      hasLegacyBatchColumns ? db.prepare(batchConversationsSql).all<ConversationRow>() : [],
      seenConversations,
      insertBuffer,
      insertConversationMap,
    );

    if (helpers.tableExists(db, 'channel_details')) {
      db.exec(copyChannelDetailsSql);
    }
    if (hasLegacyMessages) {
      db.exec(copyMessagesSql);
    }
    if (helpers.tableExists(db, 'history_import_batches')) {
      db.exec(hasLegacyBatchColumns ? copyLegacyBatchesSql : copyNormalizedBatchesSql);
    }

    db.exec('DROP TABLE history_import_batches');
    db.exec('DROP TABLE messages');
    db.exec('DROP TABLE channel_details');
    db.exec('DROP TABLE buffers');
    db.exec('DROP TABLE networks');
    db.exec('ALTER TABLE networks_next RENAME TO networks');
    db.exec('ALTER TABLE buffers_next RENAME TO buffers');
    db.exec('ALTER TABLE channel_details_next RENAME TO channel_details');
    db.exec('ALTER TABLE messages_next RENAME TO messages');
    db.exec('ALTER TABLE history_import_batches_next RENAME TO history_import_batches');
    db.exec(storageBootstrapSchemaSql);
    applyOwnedLists(db, networkLists, bufferAliases);
    dropNormalizedStorageScratchTables(db);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures after a migration error.
    }
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
};

const addMissingBuffers = (
  rows: readonly ConversationRow[],
  seenConversations: Set<string>,
  insertBuffer: SqliteStatement,
  insertConversationMap: SqliteStatement,
) => {
  for (const row of rows) {
    const key = bufferConversationKey(row.networkId, row.target);
    if (seenConversations.has(key)) {
      continue;
    }
    seenConversations.add(key);
    const createdAt = row.createdAt ?? Date.now();
    const bufferId = randomUUID();
    insertBuffer.run(
      bufferId,
      row.networkId,
      inferBufferKind(row.target),
      row.target,
      normalizeIrcIdentifier(row.target),
      row.target === 'server' ? 1 : 0,
      0,
      0,
      null,
      null,
      createdAt,
      createdAt,
    );
    insertConversationMap.run(row.networkId, normalizeIrcIdentifier(row.target), bufferId);
  }
};

const applyOwnedLists = (db: SqliteDb, networkLists: LegacyListsRow[], bufferAliases: LegacyAliasesRow[]) => {
  for (const row of networkLists) {
    replaceNetworkAltNicks(db, row.id, parseJson<string[]>(row.altNicks, []));
    replaceNetworkHistoricalSelfNicks(db, row.id, parseJson<string[]>(row.historicalSelfNicks, []));
    replaceNetworkAutoJoinChannels(db, row.id, parseJson<string[]>(row.autoJoin, []));
  }
  for (const row of bufferAliases) {
    replaceBufferSelfNickAliases(db, row.id, parseJson<string[]>(row.selfNickAliases, []));
  }
};

const inferBufferKind = (target: string) =>
  target === 'server' ? 'server' : /^[#&+!]/.test(target) ? 'channel' : 'query';

const bufferConversationKey = (networkId: string, target: string) =>
  `${networkId}:${normalizeIrcIdentifier(target)}`;

const dropNormalizedStorageScratchTables = (db: SqliteDb) => {
  db.exec('DROP TABLE IF EXISTS normalized_buffer_legacy_map');
  db.exec('DROP TABLE IF EXISTS normalized_buffer_conversation_map');
  db.exec('DROP TABLE IF EXISTS history_import_batches_next');
  db.exec('DROP TABLE IF EXISTS messages_next');
  db.exec('DROP TABLE IF EXISTS channel_details_next');
  db.exec('DROP TABLE IF EXISTS buffers_next');
  db.exec('DROP TABLE IF EXISTS networks_next');
};
