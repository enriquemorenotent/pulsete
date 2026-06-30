import type { SqliteDb } from './storage-sqlite.js';
import {
  normalizeStoredAttribution,
  resolveRuntimeMessageAttribution,
} from './message-attribution.js';
import { upsertBuffer } from './storage-buffers.js';
import { upsertQueryBuffer } from './storage-query-aliases.js';
import {
  buildIdPrefixWhereClause,
  getMessageBufferId,
  hydrateMessages,
  messageColumns,
  messageJoin,
  type MessageLookup,
} from './storage-message-shared.js';
import type { MessageInput, MessageRow } from './storage-types.js';

export const appendMessage = (
  db: SqliteDb,
  input: MessageInput,
  lookup: MessageLookup,
  resolvedBufferId?: string,
) => {
  const bufferId = ensureMessageBufferId(db, input, resolvedBufferId);
  if (!bufferId) {
    throw new Error(`Buffer not found for message target: ${input.networkId}:${input.target}`);
  }
  const attribution = shouldRespectInputAttribution(input)
    ? normalizeStoredAttribution(input)
    : resolveRuntimeMessageAttribution(input);
  db.prepare(`
    INSERT INTO messages
      (id, bufferId, nick, senderIdentityKind, senderIdentityValue, speakerRole, speakerNick,
       attributionSource, attributionConfidence, importBatchId, delivery, body, kind, self, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    bufferId,
    input.nick,
    input.senderIdentity?.kind ?? null,
    input.senderIdentity?.value ?? null,
    attribution.speakerRole,
    attribution.speakerNick ?? input.nick,
    attribution.attributionSource,
    attribution.attributionConfidence,
    input.importBatchId ?? null,
    resolveMessageDelivery(input),
    input.body,
    input.kind,
    attribution.self ? 1 : 0,
    input.ts,
  );
  return lookup(input.id)!;
};

export const deleteMessages = (db: SqliteDb, networkId: string, target: string) => {
  const bufferId = getMessageBufferId(db, networkId, target);
  if (!bufferId) {
    return [];
  }
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE m.bufferId = ?
    ORDER BY m.ts ASC, m.rowid ASC
  `).all(bufferId) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  db.prepare('DELETE FROM messages WHERE bufferId = ?').run(bufferId);
  return hydrateMessages(db, rows);
};

export const deleteMessagesByIdPrefixes = (db: SqliteDb, prefixes: string[]) => {
  const clauses = buildIdPrefixWhereClause(prefixes, 'm.id');
  if (!clauses) {
    return [];
  }
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE ${clauses.where}
    ORDER BY m.ts ASC, m.rowid ASC
  `).all(...clauses.args) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  const deleteClauses = buildIdPrefixWhereClause(prefixes);
  db.prepare(`DELETE FROM messages WHERE ${deleteClauses!.where}`).run(...deleteClauses!.args);
  return hydrateMessages(db, rows);
};

const shouldRespectInputAttribution = (input: MessageInput) =>
  input.speakerRole !== undefined
  || input.speakerNick !== undefined
  || input.attributionSource !== undefined
  || input.attributionConfidence !== undefined;

const resolveMessageDelivery = (input: MessageInput) =>
  input.delivery ?? (input.historical ? 'server-history' : 'live');

const ensureMessageBufferId = (db: SqliteDb, input: MessageInput, resolvedBufferId?: string) => {
  if (resolvedBufferId) {
    const row = db.prepare('SELECT id FROM buffers WHERE id = ?').get(resolvedBufferId);
    return row ? resolvedBufferId : null;
  }

  const routingIdentity = shouldResolveQueryByIdentity(input) ? input.senderIdentity : null;
  const existing = getMessageBufferId(db, input.networkId, input.target, routingIdentity);
  if (existing) {
    return existing;
  }

  const kind = resolveMessageBufferKind(input.target);
  const buffer = kind === 'query'
    ? upsertQueryBuffer(db, {
        networkId: input.networkId,
        kind,
        target: input.target,
        isOpen: false,
        peerIdentity: routingIdentity,
        ircCloudAvatarId: input.ircCloudAvatarId ?? undefined,
        peerIdentitySource: 'message',
      })
    : upsertBuffer(db, {
        networkId: input.networkId,
        kind,
        target: input.target,
        isOpen: kind === 'server',
      });
  if (kind === 'channel') {
    ensureChannelDetails(db, buffer.id);
  }
  return buffer.id;
};

const resolveMessageBufferKind = (target: string) =>
  target === 'server'
    ? 'server' as const
    : /^[#&+!]/.test(target)
      ? 'channel' as const
      : 'query' as const;

const shouldResolveQueryByIdentity = (input: MessageInput) =>
  !input.self && (input.kind === 'line' || input.kind === 'action');

const ensureChannelDetails = (db: SqliteDb, bufferId: string) => {
  const now = Date.now();
  db.prepare(`
    INSERT INTO channel_details
      (id, topic, users, createdAt, updatedAt)
    VALUES (?, '', '[]', ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(bufferId, now, now);
};
