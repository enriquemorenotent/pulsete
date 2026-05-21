import type { LogSource, LogSourceKind } from '../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { SqliteDb } from './storage-sqlite.js';
import type { BufferRow } from './storage-types.js';
import { listBufferSelfNickAliases } from './storage-owned-lists.js';
import { getPrimaryQueryPeerIdentity } from './storage-query-identities.js';
import { toBufferState } from './storage-utils.js';

type LogSourceFilters = {
  kind?: LogSourceKind;
  networkId?: string;
  q?: string;
};

type LogSourceRow = BufferRow & {
  firstMessageTs: number | null;
  lastMessageTs: number | null;
  messageCount: number;
};

export const listLogSources = (
  db: SqliteDb,
  filters: LogSourceFilters = {},
  limit: number,
): LogSource[] => {
  const scope = buildSourceScope(filters);
  const rows = db.prepare(`
    SELECT
      b.id,
      b.networkId,
      b.kind,
      b.target,
      b.notes,
      b.isOpen,
      b.unread,
      b.priorityUnread,
      b.lastReadTs,
      b.lastReadMessageId,
      b.ircCloudAvatarId,
      b.createdAt,
      b.updatedAt,
      count(m.id) AS messageCount,
      min(m.ts) AS firstMessageTs,
      max(m.ts) AS lastMessageTs
    FROM buffers AS b
    JOIN messages AS m ON m.bufferId = b.id
    WHERE b.kind IN ('channel', 'query')${scope.clause}
    GROUP BY b.id
    ORDER BY lastMessageTs DESC, lower(b.target) ASC
    LIMIT ?
  `).all(...scope.args, Math.max(0, limit)) as LogSourceRow[];

  return rows.map((row) => ({
    aliases: row.kind === 'query' ? listLogSourceAliases(db, row.id, row.target) : [],
    buffer: toBufferState(
      row,
      listBufferSelfNickAliases(db, row.id),
      getPrimaryQueryPeerIdentity(db, row.id),
    ),
    firstMessageTs: row.firstMessageTs,
    lastMessageTs: row.lastMessageTs,
    messageCount: row.messageCount,
    open: row.isOpen === 1,
  }));
};

const buildSourceScope = (filters: LogSourceFilters) => {
  const clauses: string[] = [];
  const args: string[] = [];
  if (filters.networkId) {
    clauses.push('b.networkId = ?');
    args.push(filters.networkId);
  }
  if (filters.kind) {
    clauses.push('b.kind = ?');
    args.push(filters.kind);
  }
  if (filters.q) {
    const text = filters.q.toLowerCase();
    const key = normalizeIrcIdentifier(filters.q);
    clauses.push(`(
      instr(lower(b.target), ?) > 0
      OR instr(b.targetKey, ?) > 0
      OR EXISTS (
        SELECT 1
        FROM query_nick_aliases AS a
        WHERE a.bufferId = b.id
          AND (instr(lower(a.nick), ?) > 0 OR instr(a.nickKey, ?) > 0)
      )
    )`);
    args.push(text, key, text, key);
  }
  return {
    clause: clauses.length === 0
      ? ''
      : `\n      AND ${clauses.join('\n      AND ')}`,
    args,
  };
};

const listLogSourceAliases = (
  db: SqliteDb,
  bufferId: string,
  target: string,
) => (db.prepare(`
  SELECT nick
  FROM query_nick_aliases
  WHERE bufferId = ?
  ORDER BY lastSeenAt DESC, nick COLLATE NOCASE ASC
`).all(bufferId) as Array<{ nick: string }>)
  .map((row) => row.nick)
  .filter((nick) => normalizeIrcIdentifier(nick) !== normalizeIrcIdentifier(target));
