import type { SqliteDb } from './storage-sqlite.js';

export const migrateMessages = (db: SqliteDb, bufferMap: Map<string, string>) => {
  const insert = db.prepare(`
    INSERT INTO messages_next
      (id, bufferId, nick, speakerRole, speakerNick, attributionSource, attributionConfidence,
       importBatchId, body, kind, self, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows = db.prepare(`
    SELECT id, bufferId, nick, speakerRole, speakerNick, attributionSource, attributionConfidence,
      importBatchId, body, kind, self, ts
    FROM messages
    ORDER BY rowid ASC
  `).all() as Array<Record<string, unknown> & { id: string; bufferId: string }>;
  for (const row of rows) {
    const bufferId = bufferMap.get(row.bufferId);
    if (bufferId) {
      insert.run(row.id, bufferId, row.nick, row.speakerRole, row.speakerNick,
        row.attributionSource, row.attributionConfidence, row.importBatchId, row.body,
        row.kind, row.self, row.ts);
    }
  }
};

export const migrateHistoryBatches = (db: SqliteDb, bufferMap: Map<string, string>) => {
  const insert = db.prepare(`
    INSERT INTO history_import_batches_next (id, bufferId, selfNickSnapshot, createdAt)
    VALUES (?, ?, ?, ?)
  `);
  const rows = db.prepare(`
    SELECT id, bufferId, selfNickSnapshot, createdAt
    FROM history_import_batches
    ORDER BY createdAt ASC
  `).all() as Array<{
    id: string;
    bufferId: string;
    selfNickSnapshot: string;
    createdAt: number;
  }>;
  for (const row of rows) {
    const bufferId = bufferMap.get(row.bufferId);
    if (bufferId) {
      insert.run(row.id, bufferId, row.selfNickSnapshot, row.createdAt);
    }
  }
};

export const migrateQueryAliases = (
  db: SqliteDb,
  networkMap: Map<string, string>,
  bufferMap: Map<string, string>,
) => {
  const insert = db.prepare(`
    INSERT INTO query_nick_aliases_next
      (bufferId, networkId, nick, nickKey, firstSeenAt, lastSeenAt, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bufferId, nickKey) DO UPDATE SET
      firstSeenAt = min(firstSeenAt, excluded.firstSeenAt),
      lastSeenAt = max(lastSeenAt, excluded.lastSeenAt),
      source = excluded.source
  `);
  const rows = db.prepare(`
    SELECT bufferId, networkId, nick, nickKey, firstSeenAt, lastSeenAt, source
    FROM query_nick_aliases
  `).all() as Array<{
    bufferId: string;
    networkId: string;
    nick: string;
    nickKey: string;
    firstSeenAt: number;
    lastSeenAt: number;
    source: string;
  }>;
  for (const row of rows) {
    const bufferId = bufferMap.get(row.bufferId);
    const networkId = networkMap.get(row.networkId);
    if (bufferId && networkId) {
      insert.run(bufferId, networkId, row.nick, row.nickKey, row.firstSeenAt,
        row.lastSeenAt, row.source);
    }
  }
};

export const migrateMutedNicks = (db: SqliteDb, networkMap: Map<string, string>) => {
  const insert = db.prepare(`
    INSERT INTO muted_nicks_next (id, networkId, nick, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(networkId, nick) DO UPDATE SET
      createdAt = min(createdAt, excluded.createdAt),
      updatedAt = max(updatedAt, excluded.updatedAt)
  `);
  const rows = db.prepare(`
    SELECT id, networkId, nick, createdAt, updatedAt FROM muted_nicks ORDER BY createdAt ASC
  `).all() as Array<{
    id: string;
    networkId: string;
    nick: string;
    createdAt: number;
    updatedAt: number;
  }>;
  for (const row of rows) {
    const networkId = networkMap.get(row.networkId);
    if (networkId) {
      insert.run(row.id, networkId, row.nick, row.createdAt, row.updatedAt);
    }
  }
};
