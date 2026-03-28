import type { DatabaseSync } from 'node:sqlite';
import {
  buildSelfNickKeys,
  resolveImportedChannelAttribution,
  resolveQueryRepairAttribution,
} from './message-attribution.js';
import { hydrateMessages, listMatchingTargets, messageColumns } from './storage-message-shared.js';
import type { MessageAttributionUpdate, MessageRow } from './storage-types.js';

export const updateMessageAttribution = (db: DatabaseSync, input: MessageAttributionUpdate) => {
  db.prepare(`
    UPDATE messages
    SET speakerRole = ?, speakerNick = ?, attributionSource = ?, attributionConfidence = ?, self = ?
    WHERE id = ?
  `).run(
    input.speakerRole,
    input.speakerNick,
    input.attributionSource,
    input.attributionConfidence,
    input.self ? 1 : 0,
    input.id,
  );
};

export const repairBufferMessageAttributions = (
  db: DatabaseSync,
  input: {
    bufferKind: 'channel' | 'query';
    networkId: string;
    target: string;
    nick: string;
    altNicks: string[];
    selfNickAliases: string[];
  },
) => {
  const matchingTargets = listMatchingTargets(db, input.networkId, input.target);
  if (matchingTargets.length === 0) {
    return [];
  }
  const placeholders = matchingTargets.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT ${messageColumns}
    FROM messages
    WHERE networkId = ? AND target IN (${placeholders})
      AND coalesce(attributionSource, 'unknown') != 'runtime'
    ORDER BY ts ASC, rowid ASC
  `).all(input.networkId, ...matchingTargets) as MessageRow[];
  if (rows.length === 0) {
    return [];
  }
  const selfNickKeys = buildSelfNickKeys({ nick: input.nick, altNicks: input.altNicks }, input.selfNickAliases);
  const repairedRows: MessageRow[] = [];
  for (const row of rows) {
    const next = input.bufferKind === 'query'
      ? resolveQueryRepairAttribution({ nick: row.nick, target: input.target, selfNickKeys })
      : resolveImportedChannelAttribution({ nick: row.nick, selfNickKeys });
    if (!messageAttributionChanged(row, next)) {
      continue;
    }
    updateMessageAttribution(db, { id: row.id, ...next });
    repairedRows.push({
      ...row,
      speakerRole: next.speakerRole,
      speakerNick: next.speakerNick,
      attributionSource: next.attributionSource,
      attributionConfidence: next.attributionConfidence,
      self: next.self ? 1 : 0,
    });
  }
  return hydrateMessages(db, repairedRows);
};

const messageAttributionChanged = (
  row: MessageRow,
  next: Omit<MessageAttributionUpdate, 'id' | 'importBatchId'>,
) =>
  row.speakerRole !== next.speakerRole
  || row.speakerNick !== next.speakerNick
  || row.attributionSource !== next.attributionSource
  || row.attributionConfidence !== next.attributionConfidence
  || Boolean(row.self) !== next.self;
