import type { SqliteDb } from './storage-sqlite.js';
import type { MessageRow } from './storage-types.js';
import { hydrateMessages, messageColumns, messageJoin } from './storage-message-shared.js';
import type { AssistantDateRange } from './ai-assistant-dates.js';
import type { AssistantResearchAction } from './ai-assistant-research.js';

function scope(bufferId: string, range: AssistantDateRange | null, maxRowid?: number) {
  return {
    where: 'm.bufferId = ?' + (range?.start != null ? ' AND m.ts >= ?' : '')
      + (range?.end != null ? ' AND m.ts < ?' : '')
      + (maxRowid !== undefined ? ' AND m.rowid <= ?' : ''),
    args: [bufferId, ...(range?.start != null ? [range.start] : []), ...(range?.end != null ? [range.end] : []), ...(maxRowid !== undefined ? [maxRowid] : [])],
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
  if (action.action === 'related') return queryRelatedMessages(db, scoped, action);
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
  const messages = historyMessages(db, scoped, rows, bodyOffset);
  return { total, messages, nextOffset: action.action !== 'read' && pageOffset + rows.length < total
    ? pageOffset + rows.length : null, shortened: rows.some((row) => row.bodyLength > bodyOffset + 2000) };
}

type HistoryRow = MessageRow & { bodyLength: number; ordinal: number };

function historyMessages(db: SqliteDb, scoped: ReturnType<typeof scope>, rows: HistoryRow[], bodyOffset: number) {
  const position = db.prepare(`SELECT count(*) AS total FROM messages m WHERE ${scoped.where}
    AND (m.ts, m.rowid) < (?, ?)`);
  return hydrateMessages(db, rows).map((message, index) => {
    const row = rows[index];
    const historyOffset = (position.get(...scoped.args, row.ts, row.ordinal) as { total: number }).total;
    return { ...message, historyOffset, bodyOffset,
      nextBodyOffset: bodyOffset + 2000 < row.bodyLength ? bodyOffset + 2000 : null };
  });
}

function queryRelatedMessages(db: SqliteDb, scoped: ReturnType<typeof scope>,
  { phrases, offset }: Extract<AssistantResearchAction, { action: 'related' }>) {
  const match = 'body : (' + [...new Set(phrases.map(phrase => phrase.toLowerCase()))]
    .map(phrase => `"${phrase.replace(/"/g, '""')}"`).join(' OR ') + ')';
  const from = `FROM message_search_fts JOIN messages AS m ON m.rowid = message_search_fts.rowid
    JOIN buffers AS b ON b.id = m.bufferId WHERE message_search_fts MATCH ? AND ${scoped.where}`;
  const args = [match, ...scoped.args];
  const total = (db.prepare(`SELECT count(*) AS total ${from}`).get(...args) as { total: number }).total;
  const columns = messageColumns.replace('m.body', 'substr(m.body, 1, 2000) AS body');
  const fields = `${columns}, length(m.body) AS bodyLength, m.rowid AS ordinal`;
  const matches = db.prepare(`SELECT ${fields} ${from} ORDER BY rank, m.ts DESC, m.rowid DESC LIMIT 6 OFFSET ?`)
    .all(...args, offset) as HistoryRow[];
  const before = db.prepare(`SELECT ${fields} ${messageJoin} WHERE ${scoped.where}
    AND (m.ts, m.rowid) < (?, ?) ORDER BY m.ts DESC, m.rowid DESC LIMIT 2`);
  const after = db.prepare(`SELECT ${fields} ${messageJoin} WHERE ${scoped.where}
    AND (m.ts, m.rowid) > (?, ?) ORDER BY m.ts, m.rowid LIMIT 2`);
  const rows = new Map<number, HistoryRow>();
  for (const hit of matches) {
    const cursor = [...scoped.args, hit.ts, hit.ordinal];
    for (const row of [hit, ...before.all(...cursor) as HistoryRow[], ...after.all(...cursor) as HistoryRow[]]) {
      rows.set(row.ordinal, row);
    }
  }
  const ordered = [...rows.values()].sort((a, b) => a.ts - b.ts || a.ordinal - b.ordinal);
  const hitIds = new Set(matches.map(({ id }) => id));
  const messages = historyMessages(db, scoped, ordered, 0).map(message => ({ ...message, matched: hitIds.has(message.id) }));
  return { total, messages, nextOffset: offset + matches.length < total ? offset + matches.length : null,
    shortened: ordered.some(row => row.bodyLength > 2000) };
}

export function readAssistantPassageMessages(db: SqliteDb, bufferId: string, maxRowid: number,
  range: AssistantDateRange | null, ids: readonly string[]) {
  if (!ids.length) return [];
  const scoped = scope(bufferId, range, maxRowid);
  const columns = messageColumns.replace('m.body', 'substr(m.body, 1, 1000) AS body');
  const rows = db.prepare(`SELECT ${columns}, length(m.body) AS bodyLength ${messageJoin}
    WHERE ${scoped.where} AND m.id IN (${ids.map(() => '?').join(',')})`)
    .all<MessageRow & { bodyLength: number }>(...scoped.args, ...ids);
  return hydrateMessages(db, rows).map((message, index) => ({
    ...message, bodyOffset: 0, nextBodyOffset: rows[index].bodyLength > 1000 ? 1000 : null,
  }));
}
