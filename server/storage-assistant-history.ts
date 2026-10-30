import type { SqliteDb } from './storage-sqlite.js';
import type { MessageRow } from './storage-types.js';
import { hydrateMessages, messageColumns, messageJoin } from './storage-message-shared.js';
import type { AssistantDateRange } from './ai-assistant-dates.js';

export const listAssistantHistory = (db: SqliteDb, bufferId: string, limit: number,
  range: AssistantDateRange | null = null) => {
  const clause = (range?.start != null ? ' AND m.ts >= ?' : '')
    + (range?.end != null ? ' AND m.ts < ?' : '');
  const args = [bufferId, ...(range?.start != null ? [range.start] : []),
    ...(range?.end != null ? [range.end] : [])];
  // Bound imported message bodies before SQLite hydrates the result page.
  const columns = messageColumns.replace('m.body', 'substr(m.body, 1, 2001) AS body');
  const rows = db.prepare(`SELECT ${columns} ${messageJoin}
    WHERE m.bufferId = ?${clause} ORDER BY m.ts DESC, m.rowid DESC LIMIT ?`)
    .all(...args, limit + 1) as MessageRow[];
  return { messages: hydrateMessages(db, rows.slice(0, limit)).reverse(), hasMore: rows.length > limit };
};
