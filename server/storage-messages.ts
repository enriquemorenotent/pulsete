import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { isSameIrcIdentifier, normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import {
  buildSelfNickKeys,
  resolveImportedChannelAttribution,
  normalizeStoredAttribution,
  resolveLegacyBackfillAttribution,
  resolveRuntimeMessageAttribution,
} from './message-attribution.js';
import type {
  HistoryImportBatchInput,
  HistoryImportBatchRow,
  MessageAttributionUpdate,
  MessageInput,
  MessagePage,
  MessageRow,
} from './storage-types.js';
import { parseJson, toMessage } from './storage-utils.js';

const emptyMessagePage: MessagePage = { messages: [], hasMore: false };
const messageColumns = [
  'id',
  'networkId',
  'target',
  'nick',
  'speakerRole',
  'speakerNick',
  'attributionSource',
  'attributionConfidence',
  'importBatchId',
  'body',
  'kind',
  'self',
  'ts',
].join(', ');

type MessageLookup = (messageId: string) => MessageInput | null;
type MessageCursor = { networkId: string; rowid: number; target: string; ts: number };
type NetworkAliasRow = {
  nick: string;
  altNicks: string;
};
type BufferAliasRow = {
  selfNickAliases: string;
};

type AttributionContext = {
  networkAliases: Map<string, NetworkAliasRow | null>;
  bufferAliases: Map<string, BufferAliasRow | null>;
};

export const appendMessage = (db: DatabaseSync, input: MessageInput, lookup: MessageLookup) => {
  const attribution = shouldRespectInputAttribution(input)
    ? normalizeStoredAttribution(input)
    : resolveRuntimeMessageAttribution(input);
  db.prepare(
    `INSERT INTO messages
       (id, networkId, target, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.networkId,
    input.target,
    input.nick,
    attribution.speakerRole,
    attribution.speakerNick ?? input.nick,
    attribution.attributionSource,
    attribution.attributionConfidence,
    input.importBatchId ?? null,
    input.body,
    input.kind,
    attribution.self ? 1 : 0,
    input.ts,
  );
  return lookup(input.id)!;
};

export const getMessageById = (db: DatabaseSync, messageId: string) => {
  const sql = `SELECT ${messageColumns} FROM messages WHERE id = ?`;
  const row = db.prepare(sql).get(messageId) as MessageRow | undefined;
  return row ? hydrateMessages(db, [row])[0] ?? null : null;
};

export const listMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  return selectMessages(db, networkId, matchingTargets, limit);
};

export const listMessagePage = (
  db: DatabaseSync,
  networkId: string,
  target: string,
  limit = 200,
  beforeMessageId?: string,
): MessagePage => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return emptyMessagePage;
  }
  const cursor = beforeMessageId ? (getMessageCursor(db, beforeMessageId) ?? null) : null;
  if (beforeMessageId && (!cursor || cursor.networkId !== networkId || !matchingTargets.includes(cursor.target))) {
    return emptyMessagePage;
  }
  return selectMessagePage(db, networkId, matchingTargets, limit, cursor);
};

export const listAllMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  return selectMessages(db, networkId, matchingTargets);
};

export const listOpeningMessages = (db: DatabaseSync, networkId: string, target: string, limit = 200) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const sql = `
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts ASC, rowid ASC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(networkId, ...matchingTargets, limit) as MessageRow[];
  return hydrateMessages(db, rows);
};

export const listRecentMessagesForBuffer = (db: DatabaseSync, networkId: string, target: string, limit = 200) =>
  listMessages(db, networkId, target, limit);

export const getMessageWindow = (db: DatabaseSync, messageId: string, before: number, after: number) => {
  const cursor = getMessageCursor(db, messageId);
  if (!cursor) {
    return [];
  }
  const matchingTargets = listMatchingTargets(db, cursor.networkId, cursor.target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const beforeRows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND (ts < ? OR (ts = ? AND rowid <= ?))
    ORDER BY ts DESC, rowid DESC
    LIMIT ?
  `).all(
    cursor.networkId,
    ...matchingTargets,
    cursor.ts,
    cursor.ts,
    cursor.rowid,
    before + 1,
  ) as MessageRow[];
  const afterRows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND (ts > ? OR (ts = ? AND rowid > ?))
    ORDER BY ts ASC, rowid ASC
    LIMIT ?
  `).all(
    cursor.networkId,
    ...matchingTargets,
    cursor.ts,
    cursor.ts,
    cursor.rowid,
    after,
  ) as MessageRow[];
  return hydrateMessages(db, [...beforeRows.reverse(), ...afterRows]);
};

export const searchMessages = (db: DatabaseSync, networkId: string, target: string, query: string, limit = 10) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0 || query.trim().length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT
      m.id,
      m.networkId,
      m.target,
      m.nick,
      m.speakerRole,
      m.speakerNick,
      m.attributionSource,
      m.attributionConfidence,
      m.importBatchId,
      m.body,
      m.kind,
      m.self,
      m.ts,
      bm25(messages_fts, 1.2, 1.0) AS score
    FROM messages_fts
    JOIN messages AS m ON m.rowid = messages_fts.rowid
    WHERE messages_fts MATCH ?
      AND m.networkId = ?
      AND m.target IN (${placeholders})
    ORDER BY score ASC, m.ts ASC, m.rowid ASC
    LIMIT ?
  `).all(query, networkId, ...matchingTargets, limit) as Array<MessageRow & { score: number }>;
  const messages = hydrateMessages(db, rows);
  return messages.map((message, index) => ({
    message,
    score: rows[index]!.score,
  }));
};

export const deleteMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const sql = `
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts ASC, rowid ASC
  `;
  const rows = db.prepare(sql).all(networkId, ...matchingTargets) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE networkId = ? AND target IN (${placeholders})`).run(networkId, ...matchingTargets);
  return hydrateMessages(db, rows);
};

export const listRecentMessages = (db: DatabaseSync, limit = 200) => {
  const sql = `SELECT ${messageColumns} FROM messages ORDER BY ts DESC, rowid DESC LIMIT ?`;
  const rows = db.prepare(sql).all(limit) as MessageRow[];
  return hydrateMessages(db, rows).reverse();
};

export const deleteMessagesByIdPrefixes = (db: DatabaseSync, prefixes: string[]) => {
  const clauses = buildIdPrefixWhereClause(prefixes);
  if (!clauses) {
    return [];
  }
  const sql = `
    SELECT ${messageColumns}
    FROM messages
    WHERE ${clauses.where}
    ORDER BY ts ASC, rowid ASC
  `;
  const rows = db.prepare(sql).all(...clauses.args) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE ${clauses.where}`).run(...clauses.args);
  return hydrateMessages(db, rows);
};

export const updateMessageAttribution = (db: DatabaseSync, input: MessageAttributionUpdate) => {
  db.prepare(`
    UPDATE messages
    SET speakerRole = ?,
        speakerNick = ?,
        attributionSource = ?,
        attributionConfidence = ?,
        self = ?
    WHERE id = ?
  `).run(
    input.speakerRole,
    input.speakerNick,
    input.attributionSource,
    input.attributionConfidence,
    input.self ? 1 : 0,
    input.id,
  );
};

export const repairBufferMessageAttributions = (
  db: DatabaseSync,
  input: {
    bufferKind: 'channel' | 'query';
    networkId: string;
    target: string;
    nick: string;
    altNicks: string[];
    selfNickAliases: string[];
  },
) => {
  const matchingTargets = listMatchingTargets(db, input.networkId, input.target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND coalesce(attributionSource, 'unknown') != 'runtime'
    ORDER BY ts ASC, rowid ASC
  `).all(input.networkId, ...matchingTargets) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  const selfNickKeys = buildSelfNickKeys({
    nick: input.nick,
    altNicks: input.altNicks,
  }, input.selfNickAliases);
  const repairedRows: MessageRow[] = [];
  for (const row of rows) {
    const next = input.bufferKind === 'query'
      ? resolveLegacyBackfillAttribution({
          nick: row.nick,
          target: input.target,
          selfNickKeys,
        })
      : resolveImportedChannelAttribution({
          nick: row.nick,
          selfNickKeys,
        });
    if (!messageAttributionChanged(row, next)) {
      continue;
    }
    updateMessageAttribution(db, {
      id: row.id,
      ...next,
    });
    repairedRows.push({
      ...row,
      speakerRole: next.speakerRole,
      speakerNick: next.speakerNick,
      attributionSource: next.attributionSource,
      attributionConfidence: next.attributionConfidence,
      self: next.self ? 1 : 0,
    });
  }
  return hydrateMessages(db, repairedRows);
};

export const createHistoryImportBatch = (db: DatabaseSync, input: HistoryImportBatchInput) => {
  const id = input.id ?? randomUUID();
  const createdAt = input.createdAt ?? Date.now();
  db.prepare(`
    INSERT INTO history_import_batches
      (id, networkId, bufferId, target, selfNickSnapshot, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.networkId,
    input.bufferId,
    input.target,
    JSON.stringify(input.selfNickSnapshot),
    createdAt,
  );
  return getHistoryImportBatch(db, id);
};

export const getHistoryImportBatch = (db: DatabaseSync, batchId: string) => {
  const row = db.prepare(`
    SELECT id, networkId, bufferId, target, selfNickSnapshot, createdAt
    FROM history_import_batches
    WHERE id = ?
  `).get(batchId) as HistoryImportBatchRow | undefined;
  if (!row) {
    return null;
  }
  return {
    ...row,
    selfNickSnapshot: parseJson<string[]>(row.selfNickSnapshot, []),
  };
};

const listMatchingTargets = (db: DatabaseSync, networkId: string, target: string) => {
  const rows = db.prepare('SELECT DISTINCT target FROM messages WHERE networkId = ?').all(networkId) as Array<{ target: string }>;
  return rows
    .map((row) => row.target)
    .filter((candidate) => isSameIrcIdentifier(candidate, target));
};

const getMessageCursor = (db: DatabaseSync, messageId: string) => {
  const sql = 'SELECT networkId, rowid, target, ts FROM messages WHERE id = ?';
  return db.prepare(sql).get(messageId) as MessageCursor | undefined;
};

const selectMessages = (
  db: DatabaseSync,
  networkId: string,
  matchingTargets: string[],
  limit?: number,
) => {
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const limitClause = typeof limit === 'number' ? '\n    LIMIT ?' : '';
  const sql = `
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts DESC, rowid DESC${limitClause}
  `;
  const args = typeof limit === 'number'
    ? [networkId, ...matchingTargets, limit]
    : [networkId, ...matchingTargets];
  const rows = db.prepare(sql).all(...args) as MessageRow[];
  return hydrateMessages(db, rows).reverse();
};

const selectMessagePage = (
  db: DatabaseSync,
  networkId: string,
  matchingTargets: string[],
  limit: number,
  before: MessageCursor | null,
): MessagePage => {
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const beforeClause = before ? '\n    AND (ts < ? OR (ts = ? AND rowid < ?))' : '';
  const sql = `
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})${beforeClause}
    ORDER BY ts DESC, rowid DESC
    LIMIT ?
  `;
  const args = before
    ? [networkId, ...matchingTargets, before.ts, before.ts, before.rowid, limit + 1]
    : [networkId, ...matchingTargets, limit + 1];
  const rows = db.prepare(sql).all(...args) as MessageRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: hydrateMessages(db, pageRows).reverse(),
    hasMore,
  };
};

const buildIdPrefixWhereClause = (prefixes: string[]) => {
  const normalized = [...new Set(prefixes.filter(Boolean))];
  if (normalized.length === 0) {
    return null;
  }
  return {
    where: normalized.map(() => 'substr(id, 1, ?) = ?').join(' OR '),
    args: normalized.flatMap((prefix) => [prefix.length, prefix]),
  };
};

const hydrateMessages = (db: DatabaseSync, rows: MessageRow[]) => {
  const context: AttributionContext = {
    networkAliases: new Map(),
    bufferAliases: new Map(),
  };
  return rows.map((row) => hydrateMessage(db, row, context));
};

const hydrateMessage = (
  db: DatabaseSync,
  row: MessageRow,
  context: AttributionContext,
) => {
  if (needsLegacyBackfill(row)) {
    const updated = backfillMessageAttribution(db, row, context);
    if (updated) {
      row = {
        ...row,
        speakerRole: updated.speakerRole,
        speakerNick: updated.speakerNick,
        attributionSource: updated.attributionSource,
        attributionConfidence: updated.attributionConfidence,
        self: updated.self ? 1 : 0,
      };
    }
  }
  return toMessage(row);
};

const needsLegacyBackfill = (row: MessageRow) =>
  isPrivateQueryTarget(row.target)
  && (!row.attributionSource || row.attributionSource === 'unknown');

const backfillMessageAttribution = (
  db: DatabaseSync,
  row: MessageRow,
  context: AttributionContext,
) => {
  const network = getNetworkAliases(db, context, row.networkId);
  const bufferAliases = getBufferAliases(db, context, row.networkId, row.target);
  if (!network) {
    return null;
  }
  const attribution = resolveLegacyBackfillAttribution({
    nick: row.nick,
    target: row.target,
    selfNickKeys: buildSelfNickKeys({
      nick: network.nick,
      altNicks: parseJson<string[]>(network.altNicks, []),
    }, parseJson<string[]>(bufferAliases?.selfNickAliases ?? '[]', [])),
  });
  updateMessageAttribution(db, {
    id: row.id,
    ...attribution,
  });
  return attribution;
};

const getNetworkAliases = (db: DatabaseSync, context: AttributionContext, networkId: string) => {
  if (context.networkAliases.has(networkId)) {
    return context.networkAliases.get(networkId) ?? null;
  }
  const row = db.prepare(`
    SELECT nick, altNicks
    FROM networks
    WHERE id = ?
  `).get(networkId) as NetworkAliasRow | undefined;
  context.networkAliases.set(networkId, row ?? null);
  return row ?? null;
};

const getBufferAliases = (
  db: DatabaseSync,
  context: AttributionContext,
  networkId: string,
  target: string,
) => {
  const key = `${networkId}:${normalizeIrcIdentifier(target)}`;
  if (context.bufferAliases.has(key)) {
    return context.bufferAliases.get(key) ?? null;
  }
  const rows = db.prepare(`
    SELECT target, selfNickAliases
    FROM buffers
    WHERE networkId = ?
  `).all(networkId) as Array<BufferAliasRow & { target: string }>;
  const row = rows.find((candidate) => isSameIrcIdentifier(candidate.target, target));
  context.bufferAliases.set(key, row ?? null);
  return row ?? null;
};

const isPrivateQueryTarget = (target: string) => target !== 'server' && !/^[#&+!]/.test(target);

const shouldRespectInputAttribution = (input: MessageInput) =>
  input.speakerRole !== undefined
  || input.speakerNick !== undefined
  || input.attributionSource !== undefined
  || input.attributionConfidence !== undefined;

const messageAttributionChanged = (row: MessageRow, next: Omit<MessageAttributionUpdate, 'id' | 'importBatchId'>) =>
  row.speakerRole !== next.speakerRole
  || row.speakerNick !== next.speakerNick
  || row.attributionSource !== next.attributionSource
  || row.attributionConfidence !== next.attributionConfidence
  || Boolean(row.self) !== next.self;
