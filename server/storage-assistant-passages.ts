import { runInTransaction } from './storage-db.js';
import { assistantPassageBucketMs } from './storage-assistant-passages-schema.js';
import type { SqliteDb } from './storage-sqlite.js';
import type { AssistantDateRange } from './ai-assistant-dates.js';

type Bucket = { bufferId: string; bucket: number; revision: number };
type MessageRow = { id: string; ts: number; rowid: number; body: string; speaker: string };
type PassageRow = { bucket: number; ordinal: number; messageIds: string; embedding: Buffer };
export type Passage = { text: string; rows: MessageRow[] };

const windowSize = 4;
const stride = 2;
const bucketMs = assistantPassageBucketMs;
const readPageSize = 128;

export class AssistantPassageStore {
  constructor(private readonly db: SqliteDb) {}

  initialize(version: string) {
    runInTransaction(this.db, () => {
      const result = this.db.prepare('UPDATE assistant_passage_state SET version = ? WHERE id = 1 AND version != ?')
        .run(version, version);
      if (result.changes) {
        this.db.exec('DELETE FROM assistant_passages; UPDATE assistant_passage_buckets SET indexedRevision = 0');
      }
    });
  }

  seed() {
    const { scannedRowid } = this.db.prepare('SELECT scannedRowid FROM assistant_passage_state WHERE id = 1')
      .get<{ scannedRowid: number }>()!;
    const { last } = this.db.prepare('SELECT max(rowid) AS last FROM (SELECT rowid FROM messages WHERE rowid > ? ORDER BY rowid LIMIT 4096)')
      .get<{ last: number | null }>(scannedRowid)!;
    if (last === null) return false;
    return runInTransaction(this.db, () => {
      this.db.prepare(`INSERT OR IGNORE INTO assistant_passage_buckets (bufferId, bucket)
        SELECT DISTINCT bufferId, CAST(ts / ${bucketMs} AS INTEGER)
        FROM messages WHERE rowid > ? AND rowid <= ?`).run(scannedRowid, last);
      this.db.prepare('UPDATE assistant_passage_state SET scannedRowid = max(scannedRowid, ?) WHERE id = 1').run(last);
      return true;
    });
  }

  nextBucket(preferredBuffer: string | null, now = Date.now()) {
    // Let a live bucket settle so active chat does not rebuild the same windows every second.
    const query = `SELECT bufferId, bucket, revision FROM assistant_passage_buckets
      WHERE revision != indexedRevision AND (bucket < ? OR changedAt <= ?)`;
    const args = [Math.floor(now / bucketMs), now - 30_000];
    return (preferredBuffer === null ? undefined
      : this.db.prepare(query + ' AND bufferId = ? ORDER BY bucket LIMIT 1').get<Bucket>(...args, preferredBuffer))
      ?? this.db.prepare(query + ' ORDER BY bucket LIMIT 1').get<Bucket>(...args);
  }

  resetStage() {
    this.db.exec(`CREATE TEMP TABLE IF NOT EXISTS assistant_passage_stage (
      ordinal INTEGER PRIMARY KEY, firstTs INTEGER NOT NULL, lastTs INTEGER NOT NULL,
      maxRowid INTEGER NOT NULL, messageIds TEXT NOT NULL, embedding BLOB NOT NULL
    ); DELETE FROM assistant_passage_stage;`);
  }

  *passageBatches(job: Bucket): Generator<Passage[]> {
    const start = job.bucket * bucketMs;
    const fields = "id, ts, rowid, substr(body, 1, 1000) AS body, coalesce(speakerNick, nick, 'unknown') AS speaker";
    const previous = this.db.prepare(`SELECT ${fields} FROM messages
      WHERE bufferId = ? AND ts >= ? AND ts < ? ORDER BY ts DESC, rowid DESC LIMIT 2`)
      .all<MessageRow>(job.bufferId, start - bucketMs, start).reverse();
    const read = this.db.prepare(`SELECT ${fields} FROM messages WHERE bufferId = ? AND ts >= ? AND ts < ?
      AND (ts, rowid) > (?, ?) ORDER BY ts, rowid LIMIT ${readPageSize}`);
    let cursor = { ts: start, rowid: 0 };
    let pending = previous;
    let batch: Passage[] = [];
    let previousWindowEnd: string | undefined;
    while (true) {
      const page = read.all<MessageRow>(job.bufferId, start, start + bucketMs, cursor.ts, cursor.rowid);
      if (!page.length) break;
      cursor = page.at(-1)!;
      for (const row of page) {
        pending.push(row);
        if (pending.length < windowSize) continue;
        batch.push(makePassage(pending));
        previousWindowEnd = row.id;
        pending = pending.slice(stride);
        if (batch.length === 16) {
          yield batch;
          batch = [];
        }
      }
    }
    const last = pending.at(-1);
    if (last && last.ts >= start && last.id !== previousWindowEnd) batch.push(makePassage(pending));
    if (batch.length) yield batch;
  }

  saveBatch(job: Bucket, ordinal: number, passages: Passage[], embeddings: Float32Array[]) {
    if (!this.isCurrent(job)) return false;
    const write = this.db.prepare(`INSERT INTO assistant_passage_stage
      (ordinal, firstTs, lastTs, maxRowid, messageIds, embedding) VALUES (?, ?, ?, ?, ?, ?)`);
    runInTransaction(this.db, () => {
      passages.forEach(({ rows }, index) => {
        const vector = embeddings[index];
        write.run(ordinal + index, rows[0].ts, rows.at(-1)!.ts,
          Math.max(...rows.map(row => row.rowid)), JSON.stringify(rows.map(row => row.id)),
          Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength));
      });
    });
    return true;
  }

  finish(job: Bucket) {
    runInTransaction(this.db, () => {
      const ready = this.db.prepare(`UPDATE assistant_passage_buckets SET indexedRevision = revision
        WHERE bufferId = ? AND bucket = ? AND revision = ? AND indexedRevision != revision`)
        .run(job.bufferId, job.bucket, job.revision);
      if (!ready.changes) return;
      this.db.prepare('DELETE FROM assistant_passages WHERE bufferId = ? AND bucket = ?').run(job.bufferId, job.bucket);
      const changed = this.db.prepare(`INSERT INTO assistant_passages
        (bufferId, bucket, ordinal, firstTs, lastTs, maxRowid, messageIds, embedding)
        SELECT ?, ?, ordinal, firstTs, lastTs, maxRowid, messageIds, embedding FROM assistant_passage_stage`)
        .run(job.bufferId, job.bucket);
      if (!changed.changes) {
        this.db.prepare('DELETE FROM assistant_passage_buckets WHERE bufferId = ? AND bucket = ?')
          .run(job.bufferId, job.bucket);
      }
    });
  }

  candidates(bufferId: string, maxRowid: number, range: AssistantDateRange | null, after: Pick<PassageRow, 'bucket' | 'ordinal'>) {
    return this.db.prepare(`SELECT p.bucket, p.ordinal, p.embedding, p.messageIds FROM assistant_passages p
      JOIN assistant_passage_buckets b USING (bufferId, bucket)
      WHERE p.bufferId = ? AND (p.bucket, p.ordinal) > (?, ?) AND b.revision = b.indexedRevision
        AND p.maxRowid <= ? AND p.lastTs >= ? AND p.firstTs < ?
      ORDER BY p.bucket, p.ordinal LIMIT 512`)
      .all<PassageRow>(bufferId, after.bucket, after.ordinal, maxRowid, range?.start ?? 0, range?.end ?? Number.MAX_SAFE_INTEGER);
  }

  private isCurrent(job: Bucket) {
    return this.db.prepare('SELECT 1 FROM assistant_passage_buckets WHERE bufferId = ? AND bucket = ? AND revision = ?')
      .get(job.bufferId, job.bucket, job.revision) !== undefined;
  }
}

function makePassage(rows: MessageRow[]): Passage {
  return { rows, text: rows.map(row => `${row.speaker}: ${row.body}`).join('\n') };
}
