import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { SqliteDb } from './storage-sqlite.js';

export const backfillQueryBufferSelfNickAliases = (db: SqliteDb) => {
  const queryBuffers = db.prepare(`
    SELECT buffers.id, networks.nick, networks.altNicks
    FROM buffers
    JOIN networks ON networks.id = buffers.networkId
    WHERE buffers.kind = 'query'
  `).all() as Array<{ id: string; nick: string; altNicks: string }>;
  const readSnapshots = db.prepare(`
    SELECT selfNickSnapshot
    FROM history_import_batches
    WHERE bufferId = ?
    ORDER BY createdAt ASC
  `);
  const updateBuffer = db.prepare(`
    UPDATE buffers
    SET selfNickAliases = ?
    WHERE id = ?
  `);
  for (const buffer of queryBuffers) {
    const currentAliases = parseJson<string[]>(
      (db.prepare('SELECT selfNickAliases FROM buffers WHERE id = ?').get(buffer.id) as { selfNickAliases?: string } | undefined)?.selfNickAliases ?? '[]',
      [],
    );
    if (currentAliases.length > 0) {
      continue;
    }
    const excluded = new Set([
      normalizeIrcIdentifier(buffer.nick),
      ...parseJson<string[]>(buffer.altNicks, []).map((nick) => normalizeIrcIdentifier(nick)),
    ]);
    const aliases: string[] = [];
    const seen = new Set<string>();
    const snapshots = readSnapshots.all(buffer.id) as Array<{ selfNickSnapshot: string }>;
    for (const snapshot of snapshots) {
      appendNewAliases(snapshot.selfNickSnapshot, aliases, seen, excluded);
    }
    updateBuffer.run(JSON.stringify(aliases), buffer.id);
  }
};

const appendNewAliases = (
  snapshot: string,
  aliases: string[],
  seen: Set<string>,
  excluded: Set<string>,
) => {
  for (const nick of parseJson<string[]>(snapshot, [])) {
    const trimmed = nick.trim();
    const key = normalizeIrcIdentifier(trimmed);
    if (!trimmed || excluded.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    aliases.push(trimmed);
  }
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
