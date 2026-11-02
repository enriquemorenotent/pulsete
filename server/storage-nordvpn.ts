import type { SqliteDb } from './storage-sqlite.js';
import type { SecretBox } from './network-secret.js';
import { badRequest } from './app-error.js';

export const ensureNordVpnStorage = (db: SqliteDb) => db.exec(`CREATE TABLE IF NOT EXISTS nordvpn_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1), secret TEXT NOT NULL
)`);

export const hasNordVpnCredentials = (db: SqliteDb) => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nordvpn_credentials'").get()) && Boolean(db.prepare('SELECT id FROM nordvpn_credentials WHERE id = 1').get());

export const saveNordVpnCredentials = (db: SqliteDb, box: SecretBox, username?: string, password?: string) => {
  if (username === undefined && password === undefined) return;
  if (!username || !password || Buffer.byteLength(username) > 255 || Buffer.byteLength(password) > 255) {
    throw badRequest('Enter both NordVPN service credentials (at most 255 bytes each)');
  }
  db.prepare('INSERT INTO nordvpn_credentials (id, secret) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET secret = excluded.secret')
    .run(box.encrypt(JSON.stringify({ username, password })));
};

export const readNordVpnCredentials = (db: SqliteDb, box: SecretBox): { username: string; password: string } | undefined => {
  const row = db.prepare('SELECT secret FROM nordvpn_credentials WHERE id = 1').get() as { secret: string } | undefined;
  return row ? JSON.parse(box.decrypt(row.secret)) : undefined;
};
