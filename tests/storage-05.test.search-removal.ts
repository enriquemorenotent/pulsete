import assert from 'node:assert/strict';
import test from 'node:test';
import { storageBootstrapSchemaSql } from '../server/storage-bootstrap-schema.js';
import { makeStorageFile, openSqliteDatabase, Storage } from './helpers/storage-test-helpers.js';

test('versioned storage migrations remove legacy message search artifacts', () => {
  const file = makeStorageFile();
  const existing = openSqliteDatabase(file);
  const now = Date.now();

  existing.exec(storageBootstrapSchemaSql);
  existing.exec('PRAGMA user_version = 17');
  existing.prepare(
    `INSERT INTO networks
       (id, workspaceOpen, name, host, port, tls, nick, username, realName, password, authMethod, authTarget, authAccount, favorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'network-1',
    1,
    'Instance',
    'irc.example.test',
    6667,
    0,
    'tester',
    'tester',
    'Tester Example',
    null,
    'none',
    'NickServ',
    '',
    0,
    now,
    now,
  );
  existing.prepare(
    `INSERT INTO buffers
       (id, networkId, kind, target, targetKey, isOpen, unread, priorityUnread, lastReadTs, lastReadMessageId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('buffer-1', 'network-1', 'query', 'MissD', 'missd', 1, 0, 0, null, null, now, now);
  existing.prepare(
    `INSERT INTO messages
       (id, bufferId, nick, speakerRole, speakerNick, attributionSource, attributionConfidence, importBatchId, body, kind, self, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('message-1', 'buffer-1', 'MissD', 'other', 'MissD', 'runtime', 'high', null, 'Old search payload', 'line', 0, now);
  existing.exec(`
    CREATE VIRTUAL TABLE messages_fts
      USING fts5(messageId UNINDEXED, bufferId UNINDEXED, nick, body);
    CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts (rowid, messageId, bufferId, nick, body)
      VALUES (new.rowid, new.id, new.bufferId, coalesce(new.nick, ''), new.body);
    END;
    CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
      INSERT INTO messages_fts (rowid, messageId, bufferId, nick, body)
      VALUES (new.rowid, new.id, new.bufferId, coalesce(new.nick, ''), new.body);
    END;
  `);
  existing.close();

  const storage = new Storage(file);
  storage.close();

  const upgraded = openSqliteDatabase(file);
  const version = upgraded.prepare('PRAGMA user_version').get() as { user_version: number };
  const artifacts = upgraded.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE name IN ('messages_fts', 'messages_ai', 'messages_ad', 'messages_au')
    ORDER BY name ASC
  `).all() as Array<{ name: string }>;
  const newArtifacts = upgraded.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE name IN ('message_search_fts', 'message_search_ai', 'message_search_ad', 'message_search_au')
    ORDER BY name ASC
  `).all() as Array<{ name: string }>;
  const messageCount = upgraded.prepare('SELECT COUNT(*) AS count FROM messages').get() as { count: number };
  const searchHits = upgraded.prepare(`
    SELECT m.id
    FROM message_search_fts AS search
    JOIN messages AS m ON m.rowid = search.rowid
    WHERE message_search_fts MATCH ?
  `).all('payload') as Array<{ id: string }>;
  upgraded.close();

  assert.equal(version.user_version, 21);
  assert.deepEqual(artifacts, []);
  assert.deepEqual(newArtifacts.map((artifact) => artifact.name), [
    'message_search_ad',
    'message_search_ai',
    'message_search_au',
    'message_search_fts',
  ]);
  assert.equal(messageCount.count, 1);
  assert.deepEqual(searchHits.map((hit) => hit.id), ['message-1']);
});
