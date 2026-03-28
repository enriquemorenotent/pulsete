import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { HistoryImportBatchInput, HistoryImportBatchRow } from './storage-types.js';
import { parseJson } from './storage-utils.js';

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
  return row ? { ...row, selfNickSnapshot: parseJson<string[]>(row.selfNickSnapshot, []) } : null;
};
