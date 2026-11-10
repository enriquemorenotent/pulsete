import { defaultIrcServerRules, ircServerRulesSchema, type IrcServerRules } from '../shared/irc-server-rules.js';
import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { SqliteDb } from './storage-sqlite.js';
import { runInTransaction } from './storage-db.js';

export class ServerRulesConflictError extends Error {}

export const serverRulesSchemaSql = `CREATE TABLE IF NOT EXISTS network_server_rules (
  networkId TEXT PRIMARY KEY REFERENCES networks(id) ON DELETE CASCADE,
  rules TEXT NOT NULL
);`;

export const getServerRules = (db: SqliteDb, networkId: string): IrcServerRules => {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'network_server_rules'").get()) return defaultIrcServerRules;
  const row = db.prepare('SELECT rules FROM network_server_rules WHERE networkId = ?').get<{rules:string}>(networkId);
  return row ? ircServerRulesSchema.parse(JSON.parse(row.rules)) : defaultIrcServerRules;
};
export const normalizeNetworkIdentifier = (db: SqliteDb, networkId: string, value: string) =>
  normalizeIrcIdentifier(value, getServerRules(db, networkId).caseMapping);

// Never silently combine conversations when a server changes its comparison rules.
export const saveServerRules = (db: SqliteDb, networkId: string, rules: IrcServerRules) => runInTransaction(db, () => {
  const previous = getServerRules(db, networkId);
  if (JSON.stringify(previous) === JSON.stringify(rules)) return;
  if (previous.caseMapping !== rules.caseMapping) {
    const buffers = db.prepare('SELECT id, target FROM buffers WHERE networkId = ? AND targetKey IS NOT NULL').all<{id:string;target:string}>(networkId);
    const keys = new Set<string>();
    for (const buffer of buffers) {
      const key = normalizeIrcIdentifier(buffer.target, rules.caseMapping);
      if (keys.has(key)) throw new ServerRulesConflictError('The server changed its nickname rules and existing conversations now conflict. Connection stopped to preserve their history.');
      keys.add(key);
    }
    db.prepare('UPDATE buffers SET targetKey = NULL WHERE networkId = ?').run(networkId);
    for (const buffer of buffers) db.prepare('UPDATE buffers SET targetKey = ? WHERE id = ?').run(normalizeIrcIdentifier(buffer.target, rules.caseMapping), buffer.id);
    // Alias rows are observations, not ownership. Rebuild their lookup keys together.
    for (const [table, owner, value, key] of [
      ['query_nick_aliases','bufferId','nick','nickKey'],
      ['network_alt_nicks','networkId','nick','nickKey'],
      ['network_historical_self_nicks','networkId','nick','nickKey'],
      ['network_auto_join_channels','networkId','channel','channelKey'],
      ['buffer_self_nick_aliases','bufferId','nick','nickKey'],
    ]) {
      const where = owner === 'bufferId' ? 'bufferId IN (SELECT id FROM buffers WHERE networkId = ?)' : 'networkId = ?';
      const rows = db.prepare(`SELECT rowid AS rowId, ${owner} AS ownerId, ${value} AS value FROM ${table} WHERE ${where}`).all<{rowId:number;ownerId:string;value:string}>(networkId);
      const seen = new Set<string>();
      // Temporary unique keys avoid update-order collisions.
      for (const row of rows) db.prepare(`UPDATE ${table} SET ${key} = ? WHERE rowid = ?`).run(`\u0000${row.rowId}`, row.rowId);
      for (const row of rows) {
        const next = normalizeIrcIdentifier(row.value, rules.caseMapping);
        const identity = JSON.stringify([row.ownerId, next]);
        if (seen.has(identity)) db.prepare(`DELETE FROM ${table} WHERE rowid = ?`).run(row.rowId);
        else db.prepare(`UPDATE ${table} SET ${key} = ? WHERE rowid = ?`).run(next, row.rowId);
        seen.add(identity);
      }
    }
  }
  db.prepare('INSERT INTO network_server_rules (networkId, rules) VALUES (?, ?) ON CONFLICT(networkId) DO UPDATE SET rules = excluded.rules').run(networkId, JSON.stringify(rules));
});
