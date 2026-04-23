import type { SqliteDb } from './storage-sqlite.js';
import type { MessageRow } from './storage-types.js';
import { messageColumns, messageJoin } from './storage-message-shared.js';

type LiteralSearchTerm = {
  indexed: boolean;
  normalized: string;
  raw: string;
};

export type SearchMessageRow = MessageRow & {
  score: number;
};

const indexedTermMinimumLength = 3;

export const searchMessageRows = (
  db: SqliteDb,
  bufferId: string,
  query: string,
  limit: number,
) => {
  const terms = parseLiteralSearchTerms(query);
  if (limit <= 0 || terms.length === 0) {
    return [];
  }
  const rows = terms.some((term) => term.indexed)
    ? iterateIndexedSearchRows(db, bufferId, buildLiteralMatchQuery(terms))
    : iterateBufferSearchRows(db, bufferId);
  const matches: SearchMessageRow[] = [];
  for (const row of rows) {
    if (!matchesLiteralTerms(row, terms)) {
      continue;
    }
    matches.push(row);
    if (matches.length >= limit) {
      break;
    }
  }
  return matches;
};

const parseLiteralSearchTerms = (query: string) => {
  const terms: LiteralSearchTerm[] = [];
  const seen = new Set<string>();
  for (const rawTerm of query.trim().split(/\s+/)) {
    const raw = rawTerm.trim();
    if (!raw) {
      continue;
    }
    const normalized = raw.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    terms.push({
      indexed: Array.from(raw).length >= indexedTermMinimumLength,
      normalized,
      raw,
    });
  }
  return terms;
};

const buildLiteralMatchQuery = (terms: LiteralSearchTerm[]) =>
  terms
    .filter((term) => term.indexed)
    .map((term) => `"${term.raw.replaceAll('"', '""')}"`)
    .join(' AND ');

const iterateIndexedSearchRows = (
  db: SqliteDb,
  bufferId: string,
  matchQuery: string,
) => db.prepare(`
  SELECT
    ${messageColumns},
    bm25(messages_fts, 1.2, 1.0) AS score
  FROM messages_fts
  JOIN messages AS m ON m.rowid = messages_fts.rowid
  JOIN buffers AS b ON b.id = m.bufferId
  WHERE messages_fts MATCH ? AND m.bufferId = ?
  ORDER BY score ASC, m.ts ASC, m.rowid ASC
`).iterate<SearchMessageRow>(matchQuery, bufferId);

const iterateBufferSearchRows = (db: SqliteDb, bufferId: string) => db.prepare(`
  SELECT
    ${messageColumns},
    0 AS score
  ${messageJoin}
  WHERE m.bufferId = ?
  ORDER BY m.ts ASC, m.rowid ASC
`).iterate<SearchMessageRow>(bufferId);

const matchesLiteralTerms = (
  row: Pick<MessageRow, 'body' | 'nick'>,
  terms: LiteralSearchTerm[],
) => {
  const body = row.body.toLowerCase();
  const nick = row.nick?.toLowerCase() ?? '';
  return terms.every((term) => body.includes(term.normalized) || nick.includes(term.normalized));
};
