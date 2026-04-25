import type { BufferState } from '../shared/protocol.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { SqliteDb } from './storage-sqlite.js';
import {
  deleteBuffer,
  getBuffer,
  getStoredBufferByTarget,
  upsertBuffer,
} from './storage-buffers.js';
import type { BufferInput } from './storage-types.js';

type QueryAliasSource = 'target' | 'nick-change';

type QueryAliasInput = {
  bufferId: string;
  networkId: string;
  nick: string;
  seenAt?: number;
  source: QueryAliasSource;
};

type AliasCandidate = {
  bufferId: string;
  messageCount: number;
};

type QueryBufferInput = BufferInput & { kind: 'query' };

export const upsertQueryNickAlias = (db: SqliteDb, input: QueryAliasInput) => {
  const nick = input.nick.trim();
  if (!nick) {
    return;
  }
  const seenAt = input.seenAt ?? Date.now();
  db.prepare(`
    INSERT INTO query_nick_aliases
      (bufferId, networkId, nick, nickKey, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bufferId, nickKey) DO UPDATE SET
      nick = excluded.nick,
      firstSeenAt = min(query_nick_aliases.firstSeenAt, excluded.firstSeenAt),
      lastSeenAt = max(query_nick_aliases.lastSeenAt, excluded.lastSeenAt),
      source = excluded.source
  `).run(input.bufferId, input.networkId, nick, normalizeIrcIdentifier(nick), seenAt, seenAt, input.source);
};

export const resolveMessageBufferId = (db: SqliteDb, networkId: string, target: string) => {
  if (target === 'server' || isChannelTarget(target)) {
    return getStoredBufferByTarget(db, networkId, target)?.id ?? null;
  }
  return resolveQueryBufferId(db, networkId, target);
};

export const resolveQueryBufferId = (db: SqliteDb, networkId: string, target: string) => {
  const exact = getStoredBufferByTarget(db, networkId, target);
  if (exact?.kind === 'query') {
    if (countBufferMessages(db, exact.id) > 0) {
      return exact.id;
    }
    const candidates = listAliasCandidates(db, networkId, target, exact.id)
      .filter((candidate) => candidate.messageCount > 0);
    return candidates.length === 1 ? candidates[0]!.bufferId : exact.id;
  }
  if (exact) {
    return exact.id;
  }
  const candidates = listAliasCandidates(db, networkId, target);
  return candidates.length === 1 ? candidates[0]!.bufferId : null;
};

export const upsertQueryBuffer = (db: SqliteDb, input: QueryBufferInput) => {
  const target = input.target.trim();
  if (input.id) {
    return upsertQueryBufferById(db, { ...input, target });
  }

  const exact = getStoredBufferByTarget(db, input.networkId, target);
  if (exact?.kind === 'query') {
    if (countBufferMessages(db, exact.id) === 0) {
      const candidates = listAliasCandidates(db, input.networkId, target, exact.id)
        .filter((candidate) => candidate.messageCount > 0);
      if (candidates.length === 1) {
        deleteBuffer(db, exact.id);
        return retargetQueryBuffer(db, getBuffer(db, candidates[0]!.bufferId)!, { ...input, target });
      }
    }
    return retargetQueryBuffer(db, exact, { ...input, target });
  }

  const candidates = listAliasCandidates(db, input.networkId, target);
  if (candidates.length === 1) {
    return retargetQueryBuffer(db, getBuffer(db, candidates[0]!.bufferId)!, { ...input, target });
  }

  const buffer = upsertBuffer(db, { ...input, target, kind: 'query' });
  upsertQueryNickAlias(db, { bufferId: buffer.id, networkId: buffer.networkId, nick: target, source: 'target' });
  return buffer;
};

export const recordObservedQueryNickChange = (
  db: SqliteDb,
  networkId: string,
  fromTarget: string,
  toTarget: string,
) => {
  const sourceId = resolveQueryBufferId(db, networkId, fromTarget);
  const source = sourceId ? getBuffer(db, sourceId) : null;
  if (source?.kind !== 'query') {
    return null;
  }

  upsertQueryNickAlias(db, { bufferId: source.id, networkId, nick: fromTarget, source: 'nick-change' });
  const destination = getStoredBufferByTarget(db, networkId, toTarget);
  const mergedBuffer = destination?.kind === 'query' && destination.id !== source.id ? destination : null;
  if (mergedBuffer) {
    copyQueryNickAliases(db, mergedBuffer.id, source.id, networkId);
    upsertQueryNickAlias(db, { bufferId: source.id, networkId, nick: mergedBuffer.target, source: 'nick-change' });
    db.prepare('UPDATE messages SET bufferId = ? WHERE bufferId = ?').run(source.id, mergedBuffer.id);
    db.prepare('UPDATE history_import_batches SET bufferId = ? WHERE bufferId = ?').run(source.id, mergedBuffer.id);
    deleteBuffer(db, mergedBuffer.id);
  }

  const updated = upsertBuffer(db, {
    ...source,
    target: toTarget,
    isOpen: true,
    unread: source.unread + (mergedBuffer?.unread ?? 0),
    priorityUnread: source.priorityUnread + (mergedBuffer?.priorityUnread ?? 0),
    ...pickLatestReadState(source, mergedBuffer),
    selfNickAliases: mergeNickAliases(source.selfNickAliases ?? [], mergedBuffer?.selfNickAliases ?? []),
  });
  upsertQueryNickAlias(db, { bufferId: updated.id, networkId, nick: toTarget, source: 'nick-change' });
  return { buffer: updated, removedBufferId: mergedBuffer?.id ?? null };
};

const upsertQueryBufferById = (db: SqliteDb, input: QueryBufferInput) => {
  const buffer = upsertBuffer(db, input);
  upsertQueryNickAlias(db, { bufferId: buffer.id, networkId: buffer.networkId, nick: buffer.target, source: 'target' });
  return buffer;
};

const retargetQueryBuffer = (db: SqliteDb, buffer: BufferState, input: QueryBufferInput) =>
  upsertQueryBufferById(db, {
    ...buffer,
    ...input,
    id: buffer.id,
    kind: 'query',
    isOpen: input.isOpen ?? true,
    unread: input.unread ?? buffer.unread,
    priorityUnread: input.priorityUnread ?? buffer.priorityUnread,
    lastReadTs: input.lastReadTs ?? buffer.lastReadTs,
    lastReadMessageId: input.lastReadMessageId ?? buffer.lastReadMessageId,
    selfNickAliases: input.selfNickAliases ?? buffer.selfNickAliases,
  });

const copyQueryNickAliases = (db: SqliteDb, fromBufferId: string, toBufferId: string, networkId: string) => {
  const aliases = db.prepare(`
    SELECT nick, nickKey, firstSeenAt, lastSeenAt, source
    FROM query_nick_aliases
    WHERE bufferId = ?
  `).all(fromBufferId) as Array<{
    nick: string;
    nickKey: string;
    firstSeenAt: number;
    lastSeenAt: number;
    source: QueryAliasSource;
  }>;
  const insert = db.prepare(`
    INSERT INTO query_nick_aliases
      (bufferId, networkId, nick, nickKey, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bufferId, nickKey) DO UPDATE SET
      nick = excluded.nick,
      firstSeenAt = min(query_nick_aliases.firstSeenAt, excluded.firstSeenAt),
      lastSeenAt = max(query_nick_aliases.lastSeenAt, excluded.lastSeenAt),
      source = excluded.source
  `);
  for (const alias of aliases) {
    insert.run(toBufferId, networkId, alias.nick, alias.nickKey, alias.firstSeenAt, alias.lastSeenAt, alias.source);
  }
};

const listAliasCandidates = (
  db: SqliteDb,
  networkId: string,
  nick: string,
  excludeBufferId?: string,
) => {
  const args = [networkId, normalizeIrcIdentifier(nick)];
  const excludeClause = excludeBufferId ? 'AND a.bufferId <> ?' : '';
  if (excludeBufferId) {
    args.push(excludeBufferId);
  }
  return db.prepare(`
    SELECT a.bufferId, COUNT(m.id) AS messageCount
    FROM query_nick_aliases AS a
    JOIN buffers AS b ON b.id = a.bufferId
    LEFT JOIN messages AS m ON m.bufferId = a.bufferId
    WHERE a.networkId = ?
      AND a.nickKey = ?
      AND b.kind = 'query'
      ${excludeClause}
    GROUP BY a.bufferId
    ORDER BY messageCount DESC, b.updatedAt DESC
  `).all(...args) as AliasCandidate[];
};

const countBufferMessages = (db: SqliteDb, bufferId: string) =>
  Number((db.prepare('SELECT COUNT(*) AS count FROM messages WHERE bufferId = ?').get(bufferId) as { count?: number } | undefined)?.count ?? 0);

const mergeNickAliases = (left: string[], right: string[]) => [...new Set([...left, ...right])];

const pickLatestReadState = (source: BufferState, merged: BufferState | null) => {
  if (!merged || merged.lastReadTs == null) {
    return { lastReadTs: source.lastReadTs, lastReadMessageId: source.lastReadMessageId };
  }
  return source.lastReadTs == null || merged.lastReadTs > source.lastReadTs
    ? { lastReadTs: merged.lastReadTs, lastReadMessageId: merged.lastReadMessageId }
    : { lastReadTs: source.lastReadTs, lastReadMessageId: source.lastReadMessageId };
};

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
