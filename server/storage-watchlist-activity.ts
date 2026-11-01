import type { ActivityInterval } from '../shared/watchlist-activity.js';
import { activityRetentionMs } from '../shared/watchlist-activity.js';
import type { SqliteDb } from './storage-sqlite.js';

export const ensureWatchlistActivityStorage = (db: SqliteDb) => db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist_activity (
    id INTEGER PRIMARY KEY,
    friendId TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
    networkId TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('online', 'away', 'offline')),
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    arrival INTEGER NOT NULL DEFAULT 0,
    transport TEXT NOT NULL CHECK(transport IN ('monitor', 'ison'))
  );
  CREATE INDEX IF NOT EXISTS idx_watchlist_activity_friend
    ON watchlist_activity(friendId, end);
  CREATE INDEX IF NOT EXISTS idx_watchlist_activity_end ON watchlist_activity(end);
`);

export class StorageWatchlistActivity {
  closed = false;
  constructor(private readonly db: SqliteDb) {}

  start(friendId: string, interval: Omit<ActivityInterval, 'id'>) {
    return Number(this.db.prepare(`INSERT INTO watchlist_activity
      (friendId, networkId, status, start, end, arrival, transport) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(friendId, interval.networkId, interval.status, interval.start, interval.end,
        Number(interval.arrival), interval.transport).lastInsertRowid);
  }

  extend(id: number, end: number) {
    this.db.prepare('UPDATE watchlist_activity SET end = max(end, ?) WHERE id = ?').run(end, id);
  }

  list(friendId: string, since: number): ActivityInterval[] {
    return (this.db.prepare(`SELECT id, networkId, status, start, end, arrival, transport
      FROM watchlist_activity WHERE friendId = ? AND end >= ? ORDER BY start, id`)
      .all(friendId, since) as (Omit<ActivityInterval, 'arrival'> & { arrival: number })[])
      .map((row) => ({ ...row, arrival: Boolean(row.arrival) }));
  }

  prune(now: number) {
    this.db.prepare('DELETE FROM watchlist_activity WHERE end < ?').run(now - activityRetentionMs);
  }
}
