export const assistantPassageBucketMs = 15 * 60_000;

const bucket = (row: 'new' | 'old') => `CAST(${row}.ts / ${assistantPassageBucketMs} AS INTEGER)`;
const invalidate = (row: 'new' | 'old') => `
  INSERT INTO assistant_passage_buckets (bufferId, bucket, revision, changedAt)
    SELECT ${row}.bufferId, ${bucket(row)}, 1, CAST(unixepoch('subsec') * 1000 AS INTEGER)
    WHERE EXISTS (SELECT 1 FROM buffers WHERE id = ${row}.bufferId)
    ON CONFLICT (bufferId, bucket) DO UPDATE SET revision = revision + 1, changedAt = excluded.changedAt;
  UPDATE assistant_passage_buckets SET revision = revision + 1, changedAt = CAST(unixepoch('subsec') * 1000 AS INTEGER)
    WHERE bufferId = ${row}.bufferId AND bucket = ${bucket(row)} + 1;
  DELETE FROM assistant_passages
    WHERE bufferId = ${row}.bufferId AND bucket BETWEEN ${bucket(row)} AND ${bucket(row)} + 1;
`;

export const assistantPassagesSchemaSql = `
  CREATE TABLE IF NOT EXISTS assistant_passage_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version TEXT NOT NULL DEFAULT '',
    scannedRowid INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO assistant_passage_state (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS assistant_passage_buckets (
    bufferId TEXT NOT NULL REFERENCES buffers(id) ON DELETE CASCADE,
    bucket INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    indexedRevision INTEGER NOT NULL DEFAULT 0,
    changedAt INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bufferId, bucket)
  );
  CREATE INDEX IF NOT EXISTS assistant_passage_dirty
    ON assistant_passage_buckets (bucket, bufferId) WHERE revision != indexedRevision;

  CREATE TABLE IF NOT EXISTS assistant_passages (
    bufferId TEXT NOT NULL,
    bucket INTEGER NOT NULL,
    ordinal INTEGER NOT NULL,
    firstTs INTEGER NOT NULL,
    lastTs INTEGER NOT NULL,
    maxRowid INTEGER NOT NULL,
    messageIds TEXT NOT NULL,
    embedding BLOB NOT NULL,
    PRIMARY KEY (bufferId, bucket, ordinal),
    FOREIGN KEY (bufferId, bucket) REFERENCES assistant_passage_buckets(bufferId, bucket) ON DELETE CASCADE
  );

  CREATE TRIGGER IF NOT EXISTS assistant_passages_insert AFTER INSERT ON messages BEGIN
    ${invalidate('new')}
  END;
  CREATE TRIGGER IF NOT EXISTS assistant_passages_delete AFTER DELETE ON messages BEGIN
    ${invalidate('old')}
  END;
  CREATE TRIGGER IF NOT EXISTS assistant_passages_update
    AFTER UPDATE OF id, bufferId, ts, body, nick, speakerNick ON messages
    WHEN old.id IS NOT new.id OR old.bufferId IS NOT new.bufferId OR old.ts IS NOT new.ts
      OR old.body IS NOT new.body OR old.nick IS NOT new.nick OR old.speakerNick IS NOT new.speakerNick
  BEGIN
    ${invalidate('old')}
    ${invalidate('new')}
  END;
`;
