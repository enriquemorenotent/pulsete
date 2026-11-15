import type { BufferState } from '../shared/protocol-chat.js';
import type { SqliteDb } from './storage-sqlite.js';

const getDraft = (db: SqliteDb, bufferId: string) => db.prepare(
  'SELECT body FROM buffer_drafts WHERE bufferId = ?',
).get<{ body: string }>(bufferId)?.body ?? '';

// Two distinct drafts cannot share one editor without changing what would be
// sent. Keep both conversations instead of choosing or combining their drafts.
export const queryDraftsConflict = (db: SqliteDb, leftId: string, rightId: string) => {
  const left = getDraft(db, leftId);
  const right = getDraft(db, rightId);
  return !!left && !!right && left !== right;
};

export const preserveQueryDraft = (db: SqliteDb, fromId: string, toId: string) => {
  if (!getDraft(db, toId)) {
    db.prepare("DELETE FROM buffer_drafts WHERE bufferId = ? AND body = ''").run(toId);
    db.prepare('UPDATE buffer_drafts SET bufferId = ? WHERE bufferId = ?').run(toId, fromId);
  }
};

export const mergeQueryNotes = (source: BufferState, candidate: BufferState) => {
  if (!source.notes || source.notes === candidate.notes) return candidate.notes;
  if (!candidate.notes) return source.notes;
  return `${source.notes}\n\n---\nRecovered notes from ${candidate.target}:\n\n${candidate.notes}`;
};
