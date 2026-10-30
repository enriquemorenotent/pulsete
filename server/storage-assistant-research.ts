import type { SqliteDb } from './storage-sqlite.js';
import type { MessageRow } from './storage-types.js';
import { hydrateMessages, messageColumns, messageJoin } from './storage-message-shared.js';
import type { AssistantDateRange } from './ai-assistant-dates.js';
import type { AssistantResearchAction } from './ai-assistant-research.js';

function scope(bufferId: string, range: AssistantDateRange | null, maxRowid?: number) {
  return {
    where: 'm.bufferId = ?' + (range ? ' AND m.ts >= ? AND m.ts < ?' : '')
      + (maxRowid !== undefined ? ' AND m.rowid <= ?' : ''),
    args: [bufferId, ...(range ? [range.start, range.end] : []), ...(maxRowid !== undefined ? [maxRowid] : [])],
  };
}

export function assistantHistorySnapshot(db: SqliteDb, bufferId: string, range: AssistantDateRange | null) {
  const scoped = scope(bufferId, range);
  return db.prepare(`SELECT count(*) AS total, coalesce(max(m.rowid), 0) AS maxRowid,
    min(m.ts) AS firstTs, max(m.ts) AS lastTs FROM messages m WHERE ${scoped.where}`)
    .get(...scoped.args) as { total: number; maxRowid: number; firstTs: number | null; lastTs: number | null };
}

export function queryAssistantHistory(db: SqliteDb, bufferId: string, maxRowid: number,
  range: AssistantDateRange | null, action: Exclude<AssistantResearchAction, { action: 'done' }>) {
  const scoped = scope(bufferId, range, maxRowid);
  let where = scoped.where;
  const args = [...scoped.args];
  if (action.action === 'search' || action.action === 'count') {
    where += ' AND instr(lower(m.body), lower(?)) > 0';
    args.push(action.query);
  }
  if (action.action === 'read') { where += ' AND m.id = ?'; args.push(action.messageId); }
  const total = (db.prepare(`SELECT count(*) AS total FROM messages m WHERE ${where}`).get(...args) as { total: number }).total;
  if (action.action === 'count') return { total, messages: [], nextOffset: null, shortened: false };
  const bodyOffset = action.action === 'read' ? action.offset : 0;
  const pageOffset = action.action === 'read' ? 0 : action.offset;
  const direction = action.action === 'page' && action.order === 'newest' ? 'DESC' : 'ASC';
  const columns = messageColumns.replace('m.body', 'substr(m.body, ?, 2000) AS body');
  const rows = db.prepare(`SELECT ${columns}, length(m.body) AS bodyLength, m.rowid AS ordinal ${messageJoin}
    WHERE ${where} ORDER BY m.ts ${direction}, m.rowid ${direction} LIMIT 20 OFFSET ?`)
    .all(bodyOffset + 1, ...args, pageOffset) as (MessageRow & { bodyLength: number; ordinal: number })[];
  const messages = hydrateMessages(db, rows).map((message, index) => {
    const row = rows[index];
    const historyOffset = (db.prepare(`SELECT count(*) AS total FROM messages m WHERE ${scoped.where}
      AND (m.ts < ? OR (m.ts = ? AND m.rowid < ?))`).get(...scoped.args, row.ts, row.ts, row.ordinal) as { total: number }).total;
    return { ...message, historyOffset, bodyOffset,
      nextBodyOffset: bodyOffset + 2000 < row.bodyLength ? bodyOffset + 2000 : null };
  });
  return { total, messages, nextOffset: action.action !== 'read' && pageOffset + rows.length < total
    ? pageOffset + rows.length : null, shortened: rows.some((row) => row.bodyLength > bodyOffset + 2000) };
}
