import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStorageMigrations,
  currentStorageSchemaVersion,
  getStorageSchemaVersion,
} from '../server/storage-migrations.js';
import {
  storageBootstrapSchemaSql,
  storageBootstrapSchemaVersion,
} from '../server/storage-bootstrap-schema.js';
import { openSqliteDatabase, type SqliteDb } from '../server/storage-sqlite.js';

const schema = (db: SqliteDb) => db.prepare(`
  SELECT type, name, sql FROM sqlite_master
  WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name
`).all();

test('fresh setup and upgrades from the fixed baseline produce the same complete schema', () => {
  const fresh = openSqliteDatabase(':memory:');
  const existing = openSqliteDatabase(':memory:');
  try {
    applyStorageMigrations(fresh, { existedBeforeOpen: false });
    existing.exec(storageBootstrapSchemaSql);
    existing.exec(`PRAGMA user_version = ${storageBootstrapSchemaVersion}`);
    applyStorageMigrations(existing, { existedBeforeOpen: true });

    assert.deepEqual(schema(fresh), schema(existing));
    assert.equal(getStorageSchemaVersion(fresh), currentStorageSchemaVersion);
    assert.equal(getStorageSchemaVersion(existing), currentStorageSchemaVersion);
    fresh.prepare('SELECT nordVpnLocation FROM networks').all();
    fresh.prepare('SELECT pinnedAt FROM messages').all();
    fresh.prepare('SELECT secret FROM nordvpn_credentials').all();
    fresh.prepare('SELECT * FROM account_images').all();
    fresh.prepare('SELECT * FROM watchlist_activity').all();
  } finally {
    fresh.close();
    existing.close();
  }
});

test('version 34 databases gain missing VPN storage through the migration itself', () => {
  const db = openSqliteDatabase(':memory:');
  try {
    applyStorageMigrations(db, { existedBeforeOpen: false });
    db.exec("INSERT INTO nordvpn_credentials (id, secret) VALUES (1, 'saved-secret')");
    db.exec('PRAGMA user_version = 34');
    applyStorageMigrations(db, { existedBeforeOpen: true });
    assert.deepEqual(db.prepare('SELECT secret FROM nordvpn_credentials').get(), { secret: 'saved-secret' });

    db.exec('DROP TABLE nordvpn_credentials; PRAGMA user_version = 34');
    const executed: string[] = [];
    applyStorageMigrations({
      ...db,
      exec(sql) { executed.push(sql); db.exec(sql); },
    }, { existedBeforeOpen: true });
    const versionWrite = executed.indexOf(`PRAGMA user_version = ${currentStorageSchemaVersion}`);
    assert.ok(executed.slice(0, versionWrite).some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS nordvpn_credentials')));
    assert.deepEqual(db.prepare('SELECT * FROM nordvpn_credentials').all(), []);
  } finally {
    db.close();
  }
});

test('interrupted fresh setup rolls back and can be retried', () => {
  const db = openSqliteDatabase(':memory:');
  try {
    assert.throws(() => applyStorageMigrations({
      ...db,
      exec(sql) {
        if (sql.startsWith('PRAGMA user_version')) throw new Error('Interrupted setup');
        db.exec(sql);
      },
    }, { existedBeforeOpen: false }), /Interrupted setup/);
    assert.deepEqual(schema(db), []);
    assert.equal(getStorageSchemaVersion(db), 0);
    applyStorageMigrations(db, { existedBeforeOpen: false });
    assert.equal(getStorageSchemaVersion(db), currentStorageSchemaVersion);
  } finally {
    db.close();
  }
});
