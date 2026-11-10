import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage } from '../server/storage.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';
import { makeStorageFile, openSqliteDatabase } from './helpers/storage-test-helpers.js';
import { markConversationBufferRead } from '../server/runtime-conversation-store.js';
import { resolveFirstUnreadDividerIndex } from '../web/src/transcript/unread-state.js';

const setup = () => {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const add = (id: string, target: string, ts: number, extra = {}) => storage.conversations.appendMessage({
    id, networkId: network.id, target, nick: target, body: 'hello tester', kind: 'line', self: false, ts, ...extra,
  });
  return { path, storage, network, add };
};

test('merged unread messages survive a newer read marker, mute changes, and restart', () => {
  const { storage, network, add, path } = setup();
  const old = storage.conversations.upsertQuery(network.id, 'oldnick');
  const next = storage.conversations.upsertQuery(network.id, 'newnick');
  add('unread-old', 'oldnick', 100);
  add('read-new', 'newnick', 105);
  markConversationBufferRead(storage.conversations, next.id);
  storage.conversations.recordObservedQueryNickChange(network.id, 'oldnick', 'newnick');
  storage.mutedNicks.upsert({ networkId: network.id, nick: 'someone-else' });
  storage.conversations.refreshUnreadVisibility(network.id);
  const buffer = storage.conversations.getBuffer(old.id)!;
  assert.equal(buffer.unread, 1);
  assert.equal(buffer.firstUnreadMessageId, 'unread-old');
  const messages = storage.conversations.listMessages(network.id, 'newnick');
  assert.equal(resolveFirstUnreadDividerIndex(messages, buffer), 0);
  storage.close();
  const reopened = new Storage(path);
  assert.equal(reopened.conversations.getBuffer(old.id)?.unread, 1);
  assert.equal(reopened.conversations.getBuffer(old.id)?.firstUnreadMessageId, 'unread-old');
  reopened.close();
});

test('muting hides unread messages; reading while muted prevents them returning on unmute', () => {
  const { storage, network, add } = setup();
  const buffer = storage.conversations.upsertQuery(network.id, 'alice');
  add('one', 'alice', 1);
  const muted = storage.mutedNicks.upsert({ networkId: network.id, nick: 'alice' });
  storage.conversations.refreshUnreadVisibility(network.id);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.unread, 0);
  markConversationBufferRead(storage.conversations, buffer.id);
  storage.mutedNicks.remove(muted.id);
  storage.conversations.refreshUnreadVisibility(network.id);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.unread, 0);
  storage.close();
});

test('late timestamps remain unread and deleting messages updates counts and the divider together', () => {
  const { storage, network, add } = setup();
  const buffer = storage.conversations.upsertQuery(network.id, 'alice');
  add('read', 'alice', 100);
  markConversationBufferRead(storage.conversations, buffer.id);
  add('late', 'alice', 50);
  add('next', 'alice', 150);
  add('history', 'alice', 20, { historical: true });
  assert.equal(storage.conversations.getBuffer(buffer.id)?.unread, 2);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.firstUnreadMessageId, 'late');
  storage.conversations.deleteMessagesByIdPrefixes(['late']);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.unread, 1);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.priorityUnread, 1);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.firstUnreadMessageId, 'next');
  storage.conversations.deleteMessages(network.id, 'alice');
  assert.equal(storage.conversations.getBuffer(buffer.id)?.unread, 0);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.firstUnreadMessageId, null);
  storage.close();
});

test('priority is recorded at arrival and is not reinterpreted when mute settings change', () => {
  const { storage, network, add } = setup();
  const buffer = storage.conversations.upsertBuffer({networkId: network.id, target: '#room', kind: 'channel'});
  storage.conversations.appendMessage({id:'live-nick', networkId:network.id, target:'#room', nick:'alice',
    body:'hello temporaryNick', kind:'line', self:false, ts:1}, buffer.id, {currentNick:'temporaryNick'});
  assert.equal(storage.conversations.getBuffer(buffer.id)?.priorityUnread, 1);
  storage.mutedNicks.upsert({networkId: network.id, nick:'bob'});
  storage.conversations.refreshUnreadVisibility(network.id);
  assert.equal(storage.conversations.getBuffer(buffer.id)?.priorityUnread, 1);
  storage.close();
});

test('old storage migrates read boundaries once and does not resurrect read messages on restart', () => {
  const {storage, network, add, path} = setup();
  const buffer = storage.conversations.upsertQuery(network.id, 'alice');
  add('read','alice',1); markConversationBufferRead(storage.conversations,buffer.id); add('unread','alice',2);
  storage.close();
  const db = openSqliteDatabase(path);
  db.exec('DROP TRIGGER unread_move; DROP TABLE unread_messages; PRAGMA user_version=35'); db.close();
  const migrated = new Storage(path);
  assert.equal(migrated.conversations.getBuffer(buffer.id)?.firstUnreadMessageId,'unread');
  markConversationBufferRead(migrated.conversations,buffer.id); migrated.close();
  const again = new Storage(path);
  assert.equal(again.conversations.getBuffer(buffer.id)?.unread,0); again.close();
});

test('a failed duplicate append cannot change unread counts', () => {
  const {storage, network, add} = setup();
  const buffer = storage.conversations.upsertQuery(network.id,'alice');
  add('same','alice',1);
  assert.throws(() => add('same','alice',2));
  assert.equal(storage.conversations.getBuffer(buffer.id)?.unread,1);
  assert.equal(storage.conversations.listMessages(network.id,'alice').length,1);
  storage.close();
});

test('migration retains muted unread messages even when the visible count is zero', () => {
  const {storage, network, add, path} = setup();
  const buffer = storage.conversations.upsertQuery(network.id,'alice');
  const muted = storage.mutedNicks.upsert({networkId:network.id,nick:'alice'});
  add('muted','alice',1); storage.close();
  const db = openSqliteDatabase(path);
  db.exec('DROP TRIGGER unread_move; DROP TABLE unread_messages; PRAGMA user_version=35'); db.close();
  const migrated = new Storage(path);
  assert.equal(migrated.conversations.getBuffer(buffer.id)?.unread,0);
  migrated.mutedNicks.remove(muted.id);
  assert.equal(migrated.conversations.getBuffer(buffer.id)?.unread,1);
  migrated.close();
});

test('an interrupted unread migration rolls back its schema and can retry without losing counts', async () => {
  const {storage, network, add, path} = setup();
  const buffer = storage.conversations.upsertQuery(network.id,'alice');
  add('one','alice',1); storage.close();
  const db = openSqliteDatabase(path);
  db.exec('DROP TRIGGER unread_move; DROP TABLE unread_messages; PRAGMA user_version=35');
  const { migrateUnreadMessages } = await import('../server/storage-unread-migration.js');
  assert.throws(() => migrateUnreadMessages({ ...db, prepare(sql) {
    if (sql.startsWith('INSERT INTO unread_messages')) throw new Error('Interrupted migration');
    return db.prepare(sql);
  }}), /Interrupted migration/);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'unread_messages'").get(), undefined);
  assert.equal(db.prepare('SELECT unread FROM buffers WHERE id = ?').get<{unread:number}>(buffer.id)?.unread,1);
  migrateUnreadMessages(db);
  assert.equal(db.prepare('SELECT count(*) AS n FROM unread_messages').get<{n:number}>()?.n,1);
  db.close();
});
