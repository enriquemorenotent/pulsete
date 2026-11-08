import { ensureNordVpnStorage } from './storage-nordvpn.js';
import { ensureWatchlistActivityStorage } from './storage-watchlist-activity.js';
import type { SqliteDb } from './storage-sqlite.js';
import { ensureQueryPeerIdentityStorage } from './storage-query-identities.js';
import {
  ensureIdentityIndexes,
  ensureNickEmojiTable,
} from './storage-identity-migration.js';
import {
  dropLegacyMessageSearchArtifacts,
  ensureMessageSearchArtifacts,
} from './storage-schema-helpers.js';
import {
  ensureCurrentBufferColumns,
  ensureCurrentMessageColumns,
  ensureCurrentNetworkColumns,
} from './storage-migration-helpers.js';

// Compatibility repairs for incomplete schemas accepted by earlier releases,
// including databases already marked current. Keep new features in versioned
// migrations instead of adding them here. Never replay data migrations here.
export const repairStorageSchema = (db: SqliteDb) => {
  ensureWatchlistActivityStorage(db);
  ensureCurrentNetworkColumns(db);
  ensureNordVpnStorage(db);
  ensureCurrentBufferColumns(db);
  ensureCurrentMessageColumns(db);
  ensureNickEmojiTable(db);
  ensureQueryPeerIdentityStorage(db);
  ensureIdentityIndexes(db);
  dropLegacyMessageSearchArtifacts(db);
  ensureMessageSearchArtifacts(db);
};
