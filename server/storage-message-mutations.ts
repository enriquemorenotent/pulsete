import type { DatabaseSync } from 'node:sqlite';
import {
  normalizeStoredAttribution,
  resolveRuntimeMessageAttribution,
} from './message-attribution.js';
import {
  buildIdPrefixWhereClause,
  hydrateMessages,
  listMatchingTargets,
  messageColumns,
  type MessageLookup,
} from './storage-message-shared.js';
import type { MessageInput, MessageRow } from './storage-types.js';

export const appendMessage = (db: DatabaseSync, input: MessageInput, lookup: MessageLookup) => {
  const attribution = shouldRespectInputAttribution(input)
    ? normalizeStoredAttribution(input)
    : resolveRuntimeMessageAttribution(input);
  db.prepare(`
    INSERT INTO messages
      (id, networkId, target, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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

export const deleteMessages = (db: DatabaseSync, networkId: string, target: string) => {
  const matchingTargets = listMatchingTargets(db, networkId, target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
    ORDER BY ts ASC, rowid ASC
  `).all(networkId, ...matchingTargets) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE networkId = ? AND target IN (${placeholders})`).run(networkId, ...matchingTargets);
  return hydrateMessages(db, rows);
};

export const deleteMessagesByIdPrefixes = (db: DatabaseSync, prefixes: string[]) => {
  const clauses = buildIdPrefixWhereClause(prefixes);
  if (!clauses) {
    return [];
  }
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE ${clauses.where}
    ORDER BY ts ASC, rowid ASC
  `).all(...clauses.args) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare(`DELETE FROM messages WHERE ${clauses.where}`).run(...clauses.args);
  return hydrateMessages(db, rows);
};

const shouldRespectInputAttribution = (input: MessageInput) =>
  input.speakerRole !== undefined
  || input.speakerNick !== undefined
  || input.attributionSource !== undefined
  || input.attributionConfidence !== undefined;
