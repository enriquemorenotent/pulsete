import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import { ensureQueryNickAliasesTable } from './storage-schema-helpers.js';
import type { SqliteDb } from './storage-sqlite.js';
import { upsertQueryNickAlias } from './storage-query-aliases.js';

type QueryBufferRow = {
  id: string;
  networkId: string;
  target: string;
  createdAt: number;
};

type NickChangeRow = {
  bufferId: string;
  networkId: string;
  body: string;
  ts: number;
};

type EmptyQueryRow = {
  id: string;
  networkId: string;
  targetKey: string;
};

type AliasCandidateRow = {
  bufferId: string;
};

export const migrateQueryNickAliases = (db: SqliteDb) => {
  ensureQueryNickAliasesTable(db);
  seedQueryTargetAliases(db);
  seedNickChangeAliases(db);
  deleteEmptyDuplicateQueryBuffers(db);
};

const seedQueryTargetAliases = (db: SqliteDb) => {
  const buffers = db.prepare(`
    SELECT id, networkId, target, createdAt
    FROM buffers
    WHERE kind = 'query'
  `).all() as QueryBufferRow[];
  for (const buffer of buffers) {
    upsertQueryNickAlias(db, {
      bufferId: buffer.id,
      networkId: buffer.networkId,
      nick: buffer.target,
      seenAt: buffer.createdAt,
      source: 'target',
    });
  }
};

const seedNickChangeAliases = (db: SqliteDb) => {
  const rows = db.prepare(`
    SELECT b.id AS bufferId, b.networkId, m.body, m.ts
    FROM messages AS m
    JOIN buffers AS b ON b.id = m.bufferId
    WHERE b.kind = 'query'
      AND m.kind = 'system'
      AND m.body LIKE '% is now known as %'
  `).all() as NickChangeRow[];
  for (const row of rows) {
    const match = /^(\S+) is now known as (\S+)$/.exec(row.body.trim());
    if (!match) {
      continue;
    }
    for (const nick of [match[1]!, match[2]!]) {
      upsertQueryNickAlias(db, {
        bufferId: row.bufferId,
        networkId: row.networkId,
        nick,
        seenAt: row.ts,
        source: 'nick-change',
      });
    }
  }
};

const deleteEmptyDuplicateQueryBuffers = (db: SqliteDb) => {
  const rows = db.prepare(`
    SELECT b.id, b.networkId, b.targetKey
    FROM buffers AS b
    LEFT JOIN messages AS m ON m.bufferId = b.id
    WHERE b.kind = 'query'
    GROUP BY b.id
    HAVING COUNT(m.id) = 0
  `).all() as EmptyQueryRow[];
  for (const row of rows) {
    const candidates = queryBuffersWithMessagesForAlias(db, row.networkId, row.targetKey, row.id);
    if (candidates.length === 1) {
      db.prepare('DELETE FROM buffers WHERE id = ?').run(row.id);
    }
  }
};

const queryBuffersWithMessagesForAlias = (
  db: SqliteDb,
  networkId: string,
  nickKey: string,
  excludeBufferId: string,
) => db.prepare(`
    SELECT a.bufferId
    FROM query_nick_aliases AS a
    JOIN buffers AS b ON b.id = a.bufferId
    JOIN messages AS m ON m.bufferId = a.bufferId
    WHERE a.networkId = ?
      AND a.nickKey = ?
      AND a.bufferId <> ?
      AND b.kind = 'query'
    GROUP BY a.bufferId
  `).all(networkId, normalizeIrcIdentifier(nickKey), excludeBufferId) as AliasCandidateRow[];
