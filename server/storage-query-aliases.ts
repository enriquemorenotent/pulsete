import type { BufferState } from '../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import type { SqliteDb } from './storage-sqlite.js';
import {
  deleteBuffer,
  getBuffer,
  getStoredBufferByTarget,
  upsertBuffer,
} from './storage-buffers.js';
import {
  copyQueryPeerIdentities,
  listQueryPeerIdentityCandidates,
  normalizeStableQueryIdentity,
  upsertQueryPeerIdentity,
} from './storage-query-identities.js';
import type { BufferInput } from './storage-types.js';

export type QueryAliasSource = 'target' | 'nick-change';

type QueryAliasInput = {
  bufferId: string;
  networkId: string;
  nick: string;
  seenAt?: number;
  source: QueryAliasSource;
};

export type QueryNickAliasRecord = {
  bufferId: string;
  networkId: string;
  nick: string;
  source: QueryAliasSource;
};

type AliasCandidate = {
  bufferId: string;
  messageCount: number;
};

type QueryBufferInput = Omit<BufferInput, 'peerIdentity'> & {
  kind: 'query';
  peerIdentity?: NetworkUserIdentity | null;
  peerIdentitySource?: 'message' | 'manual';
};

export type QueryBufferUpsertResult = {
  buffer: BufferState;
  removedBufferIds: string[];
  retargetedFrom?: string | null;
};

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

export const listQueryNickAliases = (
  db: SqliteDb,
  networkId?: string,
): QueryNickAliasRecord[] => {
  const networkClause = networkId ? 'AND a.networkId = ?' : '';
  const args = networkId ? [networkId] : [];
  return db.prepare(`
    SELECT a.bufferId, a.networkId, a.nick, a.source
    FROM query_nick_aliases AS a
    JOIN buffers AS b ON b.id = a.bufferId
    WHERE b.kind = 'query'
      AND b.isOpen = 1
      ${networkClause}
    ORDER BY a.lastSeenAt DESC, a.nick ASC
  `).all(...args) as QueryNickAliasRecord[];
};

export const resolveMessageBufferId = (
  db: SqliteDb,
  networkId: string,
  target: string,
  peerIdentity?: NetworkUserIdentity | null,
) => {
  if (target === 'server' || isChannelTarget(target)) {
    return getStoredBufferByTarget(db, networkId, target)?.id ?? null;
  }
  return resolveQueryBufferId(db, networkId, target, peerIdentity);
};

export const resolveQueryBufferId = (
  db: SqliteDb,
  networkId: string,
  target: string,
  peerIdentity?: NetworkUserIdentity | null,
) => {
  const identityCandidates = listQueryPeerIdentityCandidates(db, networkId, peerIdentity);
  if (identityCandidates.length === 1) {
    return identityCandidates[0]!.bufferId;
  }

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

export const upsertQueryBuffer = (db: SqliteDb, input: QueryBufferInput) =>
  upsertQueryBufferWithMergeResult(db, input).buffer;

export const upsertQueryBufferWithMergeResult = (db: SqliteDb, input: QueryBufferInput): QueryBufferUpsertResult => {
  const target = input.target.trim();
  const peerIdentity = normalizeStableQueryIdentity(input.peerIdentity);
  if (input.id) {
    return {
      buffer: upsertQueryBufferById(db, { ...input, target, peerIdentity }),
      removedBufferIds: [],
      retargetedFrom: null,
    };
  }

  const exact = getStoredBufferByTarget(db, input.networkId, target);
  const identityCandidates = listQueryPeerIdentityCandidates(db, input.networkId, peerIdentity);
  const identitySource = resolveIdentitySourceBuffer(db, identityCandidates);
  if (identitySource) {
    const merged = mergeQueryBuffers(
      db,
      identitySource,
      [
        ...identityCandidates
          .filter((candidate) => candidate.bufferId !== identitySource.id)
          .map((candidate) => getBuffer(db, candidate.bufferId)),
        exact?.kind === 'query' && exact.id !== identitySource.id ? exact : null,
      ],
      input.networkId,
      'target',
    );
    const retargeted = retargetQueryBufferWithMetadata(db, merged.buffer, { ...input, target, peerIdentity });
    return {
      buffer: retargeted.buffer,
      removedBufferIds: merged.removedBufferIds,
      retargetedFrom: retargeted.retargetedFrom,
    };
  }

  if (exact?.kind === 'query') {
    if (countBufferMessages(db, exact.id) === 0) {
      const candidates = listAliasCandidates(db, input.networkId, target, exact.id)
        .filter((candidate) => candidate.messageCount > 0);
      if (candidates.length === 1) {
        deleteBuffer(db, exact.id);
        const retargeted = retargetQueryBufferWithMetadata(
          db,
          getBuffer(db, candidates[0]!.bufferId)!,
          { ...input, target },
        );
        return {
          buffer: retargeted.buffer,
          removedBufferIds: [exact.id],
          retargetedFrom: retargeted.retargetedFrom,
        };
      }
    }
    const retargeted = retargetQueryBufferWithMetadata(db, exact, { ...input, target });
    return {
      buffer: retargeted.buffer,
      removedBufferIds: [],
      retargetedFrom: retargeted.retargetedFrom,
    };
  }

  const candidates = listAliasCandidates(db, input.networkId, target);
  if (candidates.length === 1) {
    const retargeted = retargetQueryBufferWithMetadata(db, getBuffer(db, candidates[0]!.bufferId)!, { ...input, target });
    return {
      buffer: retargeted.buffer,
      removedBufferIds: [],
      retargetedFrom: retargeted.retargetedFrom,
    };
  }

  const buffer = upsertBuffer(db, toBufferInput({ ...input, target, kind: 'query' }));
  upsertQueryNickAlias(db, { bufferId: buffer.id, networkId: buffer.networkId, nick: target, source: 'target' });
  recordQueryPeerIdentity(db, buffer, { ...input, target, peerIdentity });
  return { buffer, removedBufferIds: [], retargetedFrom: null };
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
  const merged = mergeQueryBuffers(db, source, [mergedBuffer], networkId, 'nick-change');

  const updated = upsertBuffer(db, {
    ...merged.buffer,
    target: toTarget,
    isOpen: true,
  });
  upsertQueryNickAlias(db, { bufferId: updated.id, networkId, nick: toTarget, source: 'nick-change' });
  return { buffer: updated, removedBufferIds: merged.removedBufferIds, retargetedFrom: source.target };
};

const upsertQueryBufferById = (db: SqliteDb, input: QueryBufferInput) => {
  const buffer = upsertBuffer(db, toBufferInput(input));
  upsertQueryNickAlias(db, { bufferId: buffer.id, networkId: buffer.networkId, nick: buffer.target, source: 'target' });
  recordQueryPeerIdentity(db, buffer, input);
  return getBuffer(db, buffer.id)!;
};

const toBufferInput = (input: QueryBufferInput): BufferInput => {
  return {
    id: input.id,
    networkId: input.networkId,
    kind: input.kind,
    target: input.target,
    notes: input.notes,
    unread: input.unread,
    priorityUnread: input.priorityUnread,
    lastReadTs: input.lastReadTs,
    lastReadMessageId: input.lastReadMessageId,
    ircCloudAvatarId: input.ircCloudAvatarId,
    selfNickAliases: input.selfNickAliases,
    isOpen: input.isOpen,
  };
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
    ircCloudAvatarId: input.ircCloudAvatarId ?? buffer.ircCloudAvatarId,
    selfNickAliases: input.selfNickAliases ?? buffer.selfNickAliases,
  });

const retargetQueryBufferWithMetadata = (
  db: SqliteDb,
  buffer: BufferState,
  input: QueryBufferInput,
) => ({
  buffer: retargetQueryBuffer(db, buffer, input),
  retargetedFrom: isSameQueryTarget(buffer.target, input.target) ? null : buffer.target,
});

const recordQueryPeerIdentity = (
  db: SqliteDb,
  buffer: BufferState,
  input: QueryBufferInput,
) => {
  const identity = normalizeStableQueryIdentity(input.peerIdentity);
  if (!identity) {
    return;
  }
  upsertQueryPeerIdentity(db, {
    bufferId: buffer.id,
    networkId: buffer.networkId,
    nick: input.target,
    identity,
    source: input.peerIdentitySource ?? 'message',
  });
};

const resolveIdentitySourceBuffer = (
  db: SqliteDb,
  candidates: readonly AliasCandidate[],
) => {
  const source = candidates[0]?.bufferId ? getBuffer(db, candidates[0].bufferId) : null;
  return source?.kind === 'query' ? source : null;
};

const mergeQueryBuffers = (
  db: SqliteDb,
  source: BufferState,
  candidates: ReadonlyArray<BufferState | null>,
  networkId: string,
  aliasSource: QueryAliasSource,
) => {
  let buffer = source;
  const removedBufferIds: string[] = [];
  for (const candidate of candidates) {
    if (candidate?.kind !== 'query' || candidate.id === source.id || removedBufferIds.includes(candidate.id)) {
      continue;
    }
    copyQueryNickAliases(db, candidate.id, source.id, networkId);
    copyQueryPeerIdentities(db, candidate.id, source.id, networkId);
    upsertQueryNickAlias(db, { bufferId: source.id, networkId, nick: candidate.target, source: aliasSource });
    db.prepare('UPDATE messages SET bufferId = ? WHERE bufferId = ?').run(source.id, candidate.id);
    db.prepare('UPDATE history_import_batches SET bufferId = ? WHERE bufferId = ?').run(source.id, candidate.id);
    deleteBuffer(db, candidate.id);
    removedBufferIds.push(candidate.id);
    buffer = {
      ...buffer,
      unread: buffer.unread + candidate.unread,
      priorityUnread: buffer.priorityUnread + candidate.priorityUnread,
      ...pickLatestReadState(buffer, candidate),
      notes: pickQueryNotes(buffer, candidate),
      ircCloudAvatarId: buffer.ircCloudAvatarId ?? candidate.ircCloudAvatarId,
      selfNickAliases: mergeNickAliases(buffer.selfNickAliases ?? [], candidate.selfNickAliases ?? []),
    };
  }
  return { buffer, removedBufferIds };
};

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

const pickQueryNotes = (source: BufferState, merged: BufferState | null) =>
  source.notes && source.notes.length > 0 ? source.notes : merged?.notes ?? source.notes ?? '';

const pickLatestReadState = (source: BufferState, merged: BufferState | null) => {
  if (!merged || merged.lastReadTs == null) {
    return { lastReadTs: source.lastReadTs, lastReadMessageId: source.lastReadMessageId };
  }
  return source.lastReadTs == null || merged.lastReadTs > source.lastReadTs
    ? { lastReadTs: merged.lastReadTs, lastReadMessageId: merged.lastReadMessageId }
    : { lastReadTs: source.lastReadTs, lastReadMessageId: source.lastReadMessageId };
};

const isSameQueryTarget = (left: string, right: string) =>
  normalizeIrcIdentifier(left) === normalizeIrcIdentifier(right);

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
