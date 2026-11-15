import { normalizeNetworkUserIdentity } from '../shared/user-identity.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import type { SqliteDb } from './storage-sqlite.js';
import { tableExists, tableHasColumn } from './storage-schema-helpers.js';

// Older runtime routing recorded our own sender identity as the peer. Remove
// only evidence supported by self messages and never by incoming messages in
// that same conversation. Mixed or unproven evidence must remain separate.
export const repairSelfQueryPeerIdentities = (db: SqliteDb) => {
  if (!tableExists(db, 'query_peer_identities') || !tableHasColumn(db, 'messages', 'senderIdentityKind')
    || !tableHasColumn(db, 'messages', 'senderIdentityValue')) return 0;
  const identities = db.prepare(`SELECT bufferId, identityKind, identityValue
    FROM query_peer_identities`).all<NetworkUserIdentityRow>();
  const messages = db.prepare(`SELECT self, senderIdentityValue AS identityValue
    FROM messages WHERE bufferId = ? AND senderIdentityKind = ?
    GROUP BY self, senderIdentityValue`);
  const remove = db.prepare(`DELETE FROM query_peer_identities
    WHERE bufferId = ? AND identityKind = ? AND identityValue = ?`);
  let removed = 0;
  for (const row of identities) {
    const identity = normalizeNetworkUserIdentity({ kind: row.identityKind, value: row.identityValue });
    if (!identity) continue;
    const evidence = messages.all<{ self: number; identityValue: string }>(row.bufferId, row.identityKind)
      .filter(message => normalizeNetworkUserIdentity({ kind: row.identityKind, value: message.identityValue })?.value === identity.value);
    if (evidence.some(message => message.self === 1) && !evidence.some(message => message.self === 0)) {
      removed += remove.run(row.bufferId, row.identityKind, row.identityValue).changes;
    }
  }
  return removed;
};

type NetworkUserIdentityRow = {
  bufferId: string;
  identityKind: NetworkUserIdentity['kind'];
  identityValue: string;
};
