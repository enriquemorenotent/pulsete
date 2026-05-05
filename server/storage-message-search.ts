import type { SqliteDb } from './storage-sqlite.js';
import type {
  MessageRow,
  MessageSearchFilters,
  MessageSearchPage,
} from './storage-types.js';
import {
  hydrateMessages,
  messageColumns,
  messageJoin,
} from './storage-message-shared.js';

export const searchMessagesByBufferId = (
  db: SqliteDb,
  bufferId: string,
  query: string,
  limit: number,
): MessageSearchPage => {
  const terms = parseSearchTerms(query);
  if (limit <= 0 || terms.length === 0) {
    return { messages: [], hasMore: false };
  }
  if (terms.some((term) => term.length < minimumFtsTermLength)) {
    return searchMessagesByBufferIdWithScan(db, bufferId, terms, limit);
  }
  return searchMessagesByBufferIdWithFts(db, bufferId, terms, limit);
};

export const searchMessages = (
  db: SqliteDb,
  query: string,
  limit: number,
  filters: MessageSearchFilters = {},
): MessageSearchPage => {
  const terms = parseSearchTerms(query);
  if (limit <= 0 || terms.length === 0) {
    return { messages: [], hasMore: false };
  }
  const scope = normalizeSearchFilters(filters);
  if (terms.some((term) => term.length < minimumFtsTermLength)) {
    return searchMessagesWithScan(db, terms, limit, scope);
  }
  return searchMessagesWithFts(db, terms, limit, scope);
};

const searchMessagesByBufferIdWithFts = (
  db: SqliteDb,
  bufferId: string,
  terms: readonly string[],
  limit: number,
): MessageSearchPage => {
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM message_search_fts AS search
    JOIN messages AS m ON m.rowid = search.rowid
    JOIN buffers AS b ON b.id = m.bufferId
    WHERE message_search_fts MATCH ?
      AND m.bufferId = ?
    ORDER BY m.ts DESC, m.rowid DESC
    LIMIT ?
  `).all(toFtsMatchQuery(terms), bufferId, limit + 1) as MessageRow[];
  return buildSearchPage(db, rows, limit);
};

const searchMessagesByBufferIdWithScan = (
  db: SqliteDb,
  bufferId: string,
  terms: readonly string[],
  limit: number,
): MessageSearchPage => {
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE m.bufferId = ?
    ORDER BY m.ts DESC, m.rowid DESC
  `).iterate(bufferId) as IterableIterator<MessageRow>;
  return scanSearchRows(db, rows, terms, limit);
};

const searchMessagesWithFts = (
  db: SqliteDb,
  terms: readonly string[],
  limit: number,
  filters: NormalizedMessageSearchFilters,
): MessageSearchPage => {
  const scope = buildSearchScopeClause(filters);
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM message_search_fts AS search
    JOIN messages AS m ON m.rowid = search.rowid
    JOIN buffers AS b ON b.id = m.bufferId
    WHERE message_search_fts MATCH ?${scope.clause}
    ORDER BY m.ts DESC, m.rowid DESC
    LIMIT ?
  `).all(toFtsMatchQuery(terms), ...scope.args, limit + 1) as MessageRow[];
  return buildSearchPage(db, rows, limit);
};

const searchMessagesWithScan = (
  db: SqliteDb,
  terms: readonly string[],
  limit: number,
  filters: NormalizedMessageSearchFilters,
): MessageSearchPage => {
  const scope = buildSearchScopeClause(filters);
  const rows = db.prepare(`
    SELECT ${messageColumns}
    ${messageJoin}
    WHERE 1 = 1${scope.clause}
    ORDER BY m.ts DESC, m.rowid DESC
  `).iterate(...scope.args) as IterableIterator<MessageRow>;
  return scanSearchRows(db, rows, terms, limit);
};

const buildSearchPage = (
  db: SqliteDb,
  rows: MessageRow[],
  limit: number,
): MessageSearchPage => ({
  messages: hydrateMessages(db, rows.length > limit ? rows.slice(0, limit) : rows),
  hasMore: rows.length > limit,
});

const scanSearchRows = (
  db: SqliteDb,
  rows: IterableIterator<MessageRow>,
  terms: readonly string[],
  limit: number,
): MessageSearchPage => {
  const matches: MessageRow[] = [];
  for (const row of rows) {
    if (!matchesSearchTerms(row, terms)) {
      continue;
    }
    matches.push(row);
    if (matches.length > limit) {
      break;
    }
  }
  return buildSearchPage(db, matches, limit);
};

const parseSearchTerms = (query: string) => {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const rawTerm of query.trim().split(/\s+/)) {
    const term = normalizeSearchText(rawTerm);
    if (!term || seen.has(term)) {
      continue;
    }
    seen.add(term);
    terms.push(term);
  }
  return terms;
};

const minimumFtsTermLength = 3;

type NormalizedMessageSearchFilters = {
  networkId?: string;
  target?: string;
};

const normalizeSearchFilters = (filters: MessageSearchFilters): NormalizedMessageSearchFilters => {
  const networkId = filters.networkId?.trim();
  const target = filters.target ? normalizeSearchText(filters.target.trim()) : '';
  return {
    ...(networkId ? { networkId } : {}),
    ...(target ? { target } : {}),
  };
};

const buildSearchScopeClause = (filters: NormalizedMessageSearchFilters) => {
  const clauses: string[] = [];
  const args: string[] = [];
  if (filters.networkId) {
    clauses.push('b.networkId = ?');
    args.push(filters.networkId);
  }
  if (filters.target) {
    clauses.push('instr(lower(b.target), ?) > 0');
    args.push(filters.target);
  }
  return {
    clause: clauses.length === 0
      ? ''
      : `\n      AND ${clauses.join('\n      AND ')}`,
    args,
  };
};

const toFtsMatchQuery = (terms: readonly string[]) =>
  terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' ');

const matchesSearchTerms = (
  row: Pick<MessageRow, 'body' | 'nick' | 'speakerNick'>,
  terms: readonly string[],
) => {
  const searchable = [
    row.body,
    row.nick ?? '',
    row.speakerNick ?? '',
  ].map(normalizeSearchText);
  return terms.every((term) => searchable.some((value) => value.includes(term)));
};

const normalizeSearchText = (value: string) => value.toLowerCase();
