import {
  maxDraftCharacters,
  type BufferDraft,
} from '../shared/protocol-preferences.js';
import type { SqliteDb } from './storage-sqlite.js';

export class StorageDraftsRepository {
  constructor(private readonly db: SqliteDb) {}

  list(): BufferDraft[] {
    return this.db.prepare(`SELECT drafts.bufferId, buffers.networkId, drafts.body, drafts.updatedAt
      FROM buffer_drafts AS drafts
      JOIN buffers ON buffers.id = drafts.bufferId
      ORDER BY drafts.updatedAt ASC`).all() as BufferDraft[];
  }

  get(bufferId: string): BufferDraft | null {
    return this.db.prepare(`SELECT drafts.bufferId, buffers.networkId, drafts.body, drafts.updatedAt
      FROM buffer_drafts AS drafts
      JOIN buffers ON buffers.id = drafts.bufferId
      WHERE drafts.bufferId = ?`).get(bufferId) as BufferDraft | undefined ?? null;
  }

  save(bufferId: string, body: string): BufferDraft | null {
    if (body.length > maxDraftCharacters) {
      throw new RangeError('Draft is too long');
    }
    if (!body) {
      this.db.prepare('DELETE FROM buffer_drafts WHERE bufferId = ?').run(bufferId);
      return null;
    }
    const updatedAt = Date.now();
    this.db.prepare(`INSERT INTO buffer_drafts (bufferId, body, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(bufferId) DO UPDATE SET body = excluded.body, updatedAt = excluded.updatedAt`)
      .run(bufferId, body, updatedAt);
    return this.get(bufferId);
  }
}
