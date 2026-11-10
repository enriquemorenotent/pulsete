import type { BufferState } from '../shared/protocol-chat.js';
import { normalizeNetworkIdentifier, getServerRules } from './storage-server-rules.js';
import { isServerChannel } from '../shared/irc-server-rules.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import type { SqliteDb } from './storage-sqlite.js';
import {
  deleteBuffer,
  getBuffer,
  getStoredBufferByTarget,
  upsertBuffer,
} from './storage-buffers.js';
import {
  queryIdentityConflicts,
  queryBuffersConflict,
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
  claimTarget?: boolean;
};

export type QueryBufferUpsertResult = {
  buffer: BufferState;
  removedBufferIds: string[];
  retargetedFrom?: string | null;
  displacedBuffers?: BufferState[];
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
  `).run(input.bufferId, input.networkId, nick, normalizeNetworkIdentifier(db, input.networkId, nick), seenAt, seenAt, input.source);
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
  if (target === 'server' || isServerChannel(target, getServerRules(db, networkId))) {
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
  const identityCandidates = listQueryPeerIdentityCandidates(db, networkId, peerIdentity).filter(candidate => !queryIdentityConflicts(db, candidate.bufferId, peerIdentity));
  if (identityCandidates.length === 1) {
    return identityCandidates[0]!.bufferId;
  }

  const exact = getStoredBufferByTarget(db, networkId, target);
  if (exact && queryIdentityConflicts(db, exact.id, peerIdentity)) return null;
  if (exact?.kind === 'query') {
    if (countBufferMessages(db, exact.id) > 0) {
      return exact.id;
    }
    const candidates = listAliasCandidates(db, networkId, target, exact.id)
      .filter((candidate) => candidate.messageCount > 0 && !queryIdentityConflicts(db, candidate.bufferId, peerIdentity));
    return candidates.length === 1 ? candidates[0]!.bufferId : exact.id;
  }
  if (exact) {
    return exact.id;
  }
  const candidates = listAliasCandidates(db, networkId, target).filter(candidate => !queryIdentityConflicts(db, candidate.bufferId, peerIdentity));
  return candidates.length === 1 ? candidates[0]!.bufferId : null;
};

export const upsertQueryBuffer = (db: SqliteDb, input: QueryBufferInput) =>
  upsertQueryBufferWithMergeResult(db, input).buffer;

export const upsertQueryBufferWithMergeResult = (db: SqliteDb, input: QueryBufferInput): QueryBufferUpsertResult => {
  const displacedBuffers: BufferState[] = [];
  const result = upsertQueryBufferWithIdentity(db, input, displacedBuffers);
  return { ...result, displacedBuffers };
};

const upsertQueryBufferWithIdentity = (db: SqliteDb, input: QueryBufferInput, displacedBuffers: BufferState[]): QueryBufferUpsertResult => {
  const target = input.target.trim();
  const peerIdentity = normalizeStableQueryIdentity(input.peerIdentity);
  if (input.claimTarget === false && !input.id) {
    const candidate = listQueryPeerIdentityCandidates(db, input.networkId, peerIdentity)
      .find(entry => !queryIdentityConflicts(db, entry.bufferId, peerIdentity));
    const exact = getStoredBufferByTarget(db, input.networkId, target);
    const existing = candidate ? getBuffer(db, candidate.bufferId)
      : exact && !queryIdentityConflicts(db, exact.id, peerIdentity) ? exact : null;
    if (existing) return { buffer: existing, removedBufferIds: [] };
    const buffer = upsertBuffer(db, { ...toBufferInput(input), queryTargetAvailable: false, isOpen: false });
    recordQueryPeerIdentity(db, buffer, input);
    return { buffer: getBuffer(db, buffer.id)!, removedBufferIds: [] };
  }
  if (input.id) {
    return {
      buffer: upsertQueryBufferById(db, { ...input, target, peerIdentity }),
      removedBufferIds: [],
      retargetedFrom: null,
    };
  }

  let exact = getStoredBufferByTarget(db, input.networkId, target);
  if (exact && queryIdentityConflicts(db, exact.id, peerIdentity)) {
    releaseQueryRoute(db, exact.id, displacedBuffers);
    exact = null;
  }
  const identityCandidates = listQueryPeerIdentityCandidates(db, input.networkId, peerIdentity).filter(candidate => !queryIdentityConflicts(db, candidate.bufferId, peerIdentity));
  const identitySource = resolveIdentitySourceBuffer(db, identityCandidates);
  if (identitySource) {
    if (exact && queryBuffersConflict(db, identitySource.id, exact.id)) {
      releaseQueryRoute(db, exact.id, displacedBuffers);
      exact = null;
    }
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
        .filter((candidate) => candidate.messageCount > 0 && !queryIdentityConflicts(db, candidate.bufferId, peerIdentity));
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

  const candidates = listAliasCandidates(db, input.networkId, target).filter(candidate => !queryIdentityConflicts(db, candidate.bufferId, peerIdentity));
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
  const displacedBuffers: BufferState[] = [];
  let destination = getStoredBufferByTarget(db, networkId, toTarget);
  if (destination && queryBuffersConflict(db, source.id, destination.id)) {
    releaseQueryRoute(db, destination.id, displacedBuffers);
    destination = null;
  }
  const mergedBuffer = destination?.kind === 'query' && destination.id !== source.id ? destination : null;
  const bufferOpen = isStoredBufferOpen(db, source.id) || (!!mergedBuffer && isStoredBufferOpen(db, mergedBuffer.id));
  const merged = mergeQueryBuffers(db, source, [mergedBuffer], networkId, 'nick-change');

  const updated = upsertBuffer(db, {
    ...merged.buffer,
    target: toTarget,
    isOpen: bufferOpen,
  });
  upsertQueryNickAlias(db, { bufferId: updated.id, networkId, nick: toTarget, source: 'nick-change' });
  return { buffer: updated, removedBufferIds: merged.removedBufferIds, retargetedFrom: source.target, bufferOpen, displacedBuffers };
};

const upsertQueryBufferById = (db: SqliteDb, input: QueryBufferInput) => {
  if (input.id && queryIdentityConflicts(db, input.id, input.peerIdentity)) throw new Error('Conflicting conversation identity');
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

const isStoredBufferOpen = (db: SqliteDb, bufferId: string) => {
  const row = db.prepare('SELECT isOpen FROM buffers WHERE id = ?').get(bufferId) as { isOpen: number } | undefined;
  return row?.isOpen === 1;
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
) => {
  db.prepare('UPDATE buffers SET targetKey = ? WHERE id = ?').run(normalizeNetworkIdentifier(db, input.networkId, input.target), buffer.id);
  return { buffer: retargetQueryBuffer(db, buffer, input),
    retargetedFrom: isSameQueryTarget(db, input.networkId, buffer.target, input.target) ? null : buffer.target };
};

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
    if (candidate?.kind !== 'query' || candidate.id === source.id || removedBufferIds.includes(candidate.id) || queryBuffersConflict(db, source.id, candidate.id)) {
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
      unread: getBuffer(db, source.id)!.unread,
      priorityUnread: getBuffer(db, source.id)!.priorityUnread,
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
  const args = [networkId, normalizeNetworkIdentifier(db, networkId, nick)];
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

const isSameQueryTarget = (db: SqliteDb, networkId: string, left: string, right: string) =>
  normalizeNetworkIdentifier(db, networkId, left) === normalizeNetworkIdentifier(db, networkId, right);


const releaseQueryRoute = (db: SqliteDb, bufferId: string, displaced: BufferState[]) => {
  db.prepare('UPDATE buffers SET targetKey = NULL WHERE id = ?').run(bufferId);
  if (isStoredBufferOpen(db, bufferId)) displaced.push(getBuffer(db, bufferId)!);
};
