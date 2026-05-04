import type { NetworkUserIdentity } from '../shared/user-identity.js';
import {
  isStableNetworkUserIdentity,
  normalizeNetworkUserIdentity,
} from '../shared/user-identity.js';
import {
  ensureQueryPeerIdentitiesTable,
} from './storage-schema-helpers.js';
import type { SqliteDb } from './storage-sqlite.js';

type QueryPeerIdentitySource = 'message' | 'manual' | 'backfill' | 'merge';

type QueryPeerIdentityInput = {
  bufferId: string;
  networkId: string;
  nick: string;
  identity: NetworkUserIdentity | null | undefined;
  seenAt?: number;
  source: QueryPeerIdentitySource;
};

export type QueryPeerIdentityCandidate = {
  bufferId: string;
  messageCount: number;
};

type QueryPeerIdentityRow = {
  identityKind: NetworkUserIdentity['kind'];
  identityValue: string;
};

export const normalizeStableQueryIdentity = (
  identity: NetworkUserIdentity | null | undefined,
) => {
  const normalized = normalizeNetworkUserIdentity(identity);
  return isStableNetworkUserIdentity(normalized) ? normalized : null;
};

export const upsertQueryPeerIdentity = (db: SqliteDb, input: QueryPeerIdentityInput) => {
  const identity = normalizeStableQueryIdentity(input.identity);
  const nick = input.nick.trim();
  if (!identity || !nick) {
    return;
  }
  const seenAt = input.seenAt ?? Date.now();
  db.prepare(`
    INSERT INTO query_peer_identities
      (bufferId, networkId, identityKind, identityValue, nick, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bufferId, identityKind, identityValue) DO UPDATE SET
      nick = excluded.nick,
      firstSeenAt = min(query_peer_identities.firstSeenAt, excluded.firstSeenAt),
      lastSeenAt = max(query_peer_identities.lastSeenAt, excluded.lastSeenAt),
      source = excluded.source
  `).run(
    input.bufferId,
    input.networkId,
    identity.kind,
    identity.value,
    nick,
    seenAt,
    seenAt,
    input.source,
  );
};

export const listQueryPeerIdentityCandidates = (
  db: SqliteDb,
  networkId: string,
  identity: NetworkUserIdentity | null | undefined,
  excludeBufferId?: string,
) => {
  const normalized = normalizeStableQueryIdentity(identity);
  if (!normalized) {
    return [];
  }
  const args = [networkId, normalized.kind, normalized.value];
  const excludeClause = excludeBufferId ? 'AND q.bufferId <> ?' : '';
  if (excludeBufferId) {
    args.push(excludeBufferId);
  }
  return db.prepare(`
    SELECT q.bufferId, COUNT(m.id) AS messageCount
    FROM query_peer_identities AS q
    JOIN buffers AS b ON b.id = q.bufferId
    LEFT JOIN messages AS m ON m.bufferId = q.bufferId
    WHERE q.networkId = ?
      AND q.identityKind = ?
      AND q.identityValue = ?
      AND b.kind = 'query'
      ${excludeClause}
    GROUP BY q.bufferId
    ORDER BY messageCount DESC, b.updatedAt DESC
  `).all(...args) as QueryPeerIdentityCandidate[];
};

export const getPrimaryQueryPeerIdentity = (
  db: SqliteDb,
  bufferId: string,
): NetworkUserIdentity | null => {
  const row = db.prepare(`
    SELECT identityKind, identityValue
    FROM query_peer_identities
    WHERE bufferId = ?
    ORDER BY
      CASE identityKind
        WHEN 'account' THEN 0
        WHEN 'userhost' THEN 1
        ELSE 2
      END ASC,
      lastSeenAt DESC
    LIMIT 1
  `).get(bufferId) as QueryPeerIdentityRow | undefined;
  return normalizeStableQueryIdentity(
    row ? { kind: row.identityKind, value: row.identityValue } : null,
  );
};

export const copyQueryPeerIdentities = (
  db: SqliteDb,
  fromBufferId: string,
  toBufferId: string,
  networkId: string,
) => {
  const rows = db.prepare(`
    SELECT identityKind, identityValue, nick, firstSeenAt, lastSeenAt
    FROM query_peer_identities
    WHERE bufferId = ?
  `).all(fromBufferId) as Array<QueryPeerIdentityRow & {
    nick: string;
    firstSeenAt: number;
    lastSeenAt: number;
  }>;
  const insert = db.prepare(`
    INSERT INTO query_peer_identities
      (bufferId, networkId, identityKind, identityValue, nick, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'merge')
    ON CONFLICT(bufferId, identityKind, identityValue) DO UPDATE SET
      nick = excluded.nick,
      firstSeenAt = min(query_peer_identities.firstSeenAt, excluded.firstSeenAt),
      lastSeenAt = max(query_peer_identities.lastSeenAt, excluded.lastSeenAt),
      source = excluded.source
  `);
  for (const row of rows) {
    insert.run(
      toBufferId,
      networkId,
      row.identityKind,
      row.identityValue,
      row.nick,
      row.firstSeenAt,
      row.lastSeenAt,
    );
  }
};

export const ensureQueryPeerIdentityStorage = (db: SqliteDb) => {
  ensureQueryPeerIdentitiesTable(db);
};

export const backfillQueryPeerIdentities = (db: SqliteDb) => {
  ensureQueryPeerIdentityStorage(db);
  const rows = db.prepare(`
    SELECT
      b.id AS bufferId,
      b.networkId AS networkId,
      b.target AS target,
      m.senderIdentityKind AS identityKind,
      m.senderIdentityValue AS identityValue,
      min(m.ts) AS firstSeenAt,
      max(m.ts) AS lastSeenAt
    FROM buffers AS b
    JOIN messages AS m ON m.bufferId = b.id
    WHERE b.kind = 'query'
      AND m.self = 0
      AND m.senderIdentityKind IN ('account', 'userhost')
      AND m.senderIdentityValue IS NOT NULL
      AND m.senderIdentityValue <> ''
    GROUP BY b.id, m.senderIdentityKind, m.senderIdentityValue
    ORDER BY b.id ASC
  `).all() as Array<{
    bufferId: string;
    networkId: string;
    target: string;
    identityKind: NetworkUserIdentity['kind'];
    identityValue: string;
    firstSeenAt: number;
    lastSeenAt: number;
  }>;

  const byBuffer = new Map<string, typeof rows>();
  for (const row of rows) {
    byBuffer.set(row.bufferId, [...(byBuffer.get(row.bufferId) ?? []), row]);
  }

  for (const candidates of byBuffer.values()) {
    const accountCandidates = candidates.filter((row) => row.identityKind === 'account');
    const selected = uniqueIdentity(accountCandidates) ?? uniqueIdentity(
      candidates.filter((row) => row.identityKind === 'userhost'),
    );
    if (!selected) {
      continue;
    }
    upsertQueryPeerIdentity(db, {
      bufferId: selected.bufferId,
      networkId: selected.networkId,
      nick: selected.target,
      identity: { kind: selected.identityKind, value: selected.identityValue },
      seenAt: selected.lastSeenAt,
      source: 'backfill',
    });
  }
};

const uniqueIdentity = <T extends QueryPeerIdentityRow>(rows: T[]) => {
  const normalized = rows
    .map((row) => normalizeStableQueryIdentity({
      kind: row.identityKind,
      value: row.identityValue,
    }))
    .filter((identity): identity is NetworkUserIdentity => identity !== null);
  const keys = new Set(normalized.map((identity) => `${identity.kind}:${identity.value}`));
  return keys.size === 1 ? rows[0] ?? null : null;
};
