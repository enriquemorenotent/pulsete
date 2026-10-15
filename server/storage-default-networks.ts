import { randomBytes } from 'node:crypto';
import type { SecretBox } from './network-secret.js';
import { upsertNetwork } from './storage-networks.js';
import type { SqliteDb } from './storage-sqlite.js';

// Official connection details: https://libera.chat/guides/connect and https://oftc.net/
const defaultNetworks = [
  { name: 'Libera.Chat', host: 'irc.libera.chat' },
  { name: 'OFTC', host: 'irc.oftc.net' },
] as const;

// Called inside the storage bootstrap transaction, only for application startup.
export const initializeDefaultNetworks = (db: SqliteDb, secretBox: SecretBox) => {
  db.exec(`CREATE TABLE IF NOT EXISTS network_defaults_initialization (
    id INTEGER PRIMARY KEY CHECK (id = 1)
  )`);
  if (db.prepare('SELECT id FROM network_defaults_initialization WHERE id = 1').get()) {
    return;
  }

  // Existing profiles belong to the user. Never mix in defaults or dev data.
  if (!db.prepare('SELECT id FROM networks LIMIT 1').get()) {
    const nick = `guest${randomBytes(2).toString('hex')}`;
    for (const network of defaultNetworks) {
      upsertNetwork(db, {
        ...network,
        workspaceOpen: false,
        port: 6697,
        tls: true,
        nick,
        altNicks: [],
        realName: '',
        authMethod: 'none',
        authTarget: 'NickServ',
        authAccount: '',
        favorite: false,
        autoJoin: [],
      }, secretBox);
    }
  }
  // Keep deletions permanent, including when all suggested networks are removed.
  db.prepare('INSERT INTO network_defaults_initialization (id) VALUES (1)').run();
};
