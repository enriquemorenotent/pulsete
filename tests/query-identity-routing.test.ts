import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage } from '../server/storage.js';
import { makeStorageFile, openSqliteDatabase } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';
import { isUserMuted } from '../shared/muted-nicks.js';
import { matchesIdentityScopedEntry, compareIdentityEvidence } from '../shared/user-identity.js';
import { listConversationBufferHistory, clearConversationQueryHistory } from '../server/runtime-conversation-store.js';
import { buildConversationIndex } from '../web/src/conversation-selectors.js';

const alice = {kind:'account' as const,value:'alice'};
const bob = {kind:'account' as const,value:'bob'};
const setup = () => {
  const path = makeStorageFile(); const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const add = (id: string, nick: string, identity = alice) => storage.conversations.appendMessage({
    id, networkId: network.id,target:nick,nick, senderIdentity:identity,body:id,kind:'line',self:false,ts:1,
  });
  return {path,storage,network,add};
};

test('nickname fallback distinguishes missing identity from a conflicting identity', () => {
  const entry = {networkId:'net',nick:'same',identity:alice};
  const target = {networkId:'net',nick:'same',identity:bob};
  assert.equal(compareIdentityEvidence(alice,bob),'conflict');
  assert.equal(isUserMuted([entry],target),false);
  assert.equal(matchesIdentityScopedEntry(entry,target,{allowUnknownNickFallback:true}),false);
  assert.equal(isUserMuted([entry],{...target,identity:{kind:'nick',value:'same'}}),true);
  assert.equal(matchesIdentityScopedEntry(entry,{...target,identity:{kind:'nick',value:'same'}}),false);
  assert.equal(isUserMuted([entry],{...target,nick:'renamed',identity:alice}),true);
});

test('nickname reuse preserves separate histories, drafts, notes and unread messages across restart', () => {
  const {path,storage,network,add} = setup();
  const a = storage.conversations.upsertQuery(network.id,'old',alice);
  const b = storage.conversations.upsertQuery(network.id,'new',bob);
  add('alice-message','old'); add('bob-message','new',bob);
  storage.conversations.setBufferNotes(b.id,'Bob notes'); storage.drafts.save(b.id,'Bob draft');
  const result = storage.conversations.upsertQueryWithMergeResult(network.id,'new',alice);
  assert.equal(result.buffer.id,a.id); assert.deepEqual(result.removedBufferIds,[]);
  assert.equal(result.displacedBuffers?.[0]?.id,b.id);
  assert.equal(storage.conversations.getBuffer(b.id)?.queryTargetAvailable,false);
  assert.equal(storage.conversations.getBuffer(b.id)?.notes,'Bob notes');
  assert.equal(storage.conversations.getBuffer(b.id)?.unread,1);
  assert.deepEqual(listConversationBufferHistory(storage.conversations,b.id,10).messages.map(m=>m.id),['bob-message']);
  assert.deepEqual(storage.conversations.listMessages(network.id,'new').map(m=>m.id),['alice-message']);
  const index = buildConversationIndex({buffers:storage.conversations.listBuffers(),channels:[],pendingChannels:[]});
  assert.equal(index.findQueryBuffer(network.id,'new')?.id,a.id);
  assert.equal(index.findBufferById(b.id)?.id,b.id);
  storage.close();
  const reopened = new Storage(path);
  assert.equal(reopened.conversations.getBuffer(b.id)?.queryTargetAvailable,false);
  assert.equal(reopened.drafts.list().find(d=>d.bufferId===b.id)?.body,'Bob draft');
  clearConversationQueryHistory(reopened.conversations,b.id);
  assert.deepEqual(reopened.conversations.listMessages(network.id,'new').map(m=>m.id),['alice-message']);
  reopened.close();
});

test('a new account using an occupied nickname creates a separate conversation', () => {
  const {storage,network,add} = setup();
  const a = storage.conversations.upsertQuery(network.id,'same',alice); add('a','same');
  const b = storage.conversations.upsertQuery(network.id,'same',bob); add('b','same',bob);
  assert.notEqual(a.id,b.id);
  assert.equal(storage.conversations.getBuffer(a.id)?.queryTargetAvailable,false);
  assert.deepEqual(storage.conversations.listAllMessagesForBuffer(a.id).map(m=>m.id),['a']);
  assert.deepEqual(storage.conversations.listAllMessagesForBuffer(b.id).map(m=>m.id),['b']);
  storage.close();
});

test('observed nickname changes cannot merge conflicting account histories', () => {
  const {storage,network,add} = setup();
  const a=storage.conversations.upsertQuery(network.id,'old',alice);
  const b=storage.conversations.upsertQuery(network.id,'new',bob);
  add('a','old'); add('b','new',bob);
  const result=storage.conversations.recordObservedQueryNickChange(network.id,'old','new')!;
  assert.equal(result.buffer.id,a.id); assert.equal(result.removedBufferIds.length,0);
  assert.equal(storage.conversations.getBuffer(b.id)?.queryTargetAvailable,false);
  const returned=storage.conversations.upsertQuery(network.id,'bob-now',bob);
  assert.equal(returned.id,b.id); assert.notEqual(returned.queryTargetAvailable,false);
  assert.equal(storage.conversations.getBufferByTarget(network.id,'bob-now')?.id,b.id);
  storage.close();
});

test('detached conversations cannot send and runtime publishes their loss of the nickname', async () => {
  const {storage,network} = setup();
  const {createRuntime} = await import('../server/runtime.js');
  const runtime = createRuntime(storage);
  const old = runtime.conversations.openQuery(network.id,'same',alice).buffer;
  const changed = runtime.conversations.openQuery(network.id,'same',bob);
  assert.ok(changed.messages.some(message => message.type === 'buffer.upsert' && message.buffer.id === old.id && message.buffer.queryTargetAvailable === false));
  assert.throws(() => runtime.irc.sendMessage(network.id,'same','do not send','message',old.id), /different person/);
  assert.throws(() => runtime.irc.sendRaw(network.id,'PRIVMSG same :do not send',old.id), /different person/);
  runtime.gateway.close(); storage.close();
});

test('routing migration preserves messages, unread ledger, drafts, and foreign keys', async () => {
  const path = makeStorageFile();
  const db = openSqliteDatabase(path);
  const { storageBootstrapSchemaSql } = await import('../server/storage-bootstrap-schema.js');
  const { storageMigrations } = await import('../server/storage-migration-list.js');
  db.exec(storageBootstrapSchemaSql);
  for (const migration of storageMigrations.filter(m => m.version > 30 && m.version <= 36)) migration.apply(db, {existedBeforeOpen:true});
  db.exec(`INSERT INTO networks (id,name,host,port,tls,nick,createdAt,updatedAt) VALUES ('net','Net','irc.test',6667,0,'me',1,1);
    INSERT INTO buffers (id,networkId,kind,target,targetKey,createdAt,updatedAt) VALUES ('buffer','net','query','alice','alice',1,1);
    INSERT INTO messages (id,bufferId,body,kind,self,ts) VALUES ('one','buffer','hello','line',0,1);
    INSERT INTO unread_messages (messageId,bufferId,messageTs,messageOrder,priority,muted) VALUES ('one','buffer',1,1,1,0);
    INSERT INTO buffer_drafts (bufferId,body,updatedAt) VALUES ('buffer','draft',1);
    PRAGMA user_version=36;`);
  const { migrateQueryRouting } = await import('../server/storage-query-routing-migration.js');
  assert.throws(() => migrateQueryRouting({...db, exec(sql) {
    if (sql.startsWith('INSERT INTO buffers_routed')) throw new Error('Interrupted migration');
    db.exec(sql);
  }}), /Interrupted migration/);
  assert.equal(db.prepare('SELECT unread FROM buffers WHERE id = ?').get<{unread:number}>('buffer')?.unread,1);
  db.close();
  const migrated=new Storage(path);
  assert.equal(migrated.conversations.getBuffer('buffer')?.unread,1);
  assert.equal(migrated.drafts.list()[0]?.body,'draft');
  assert.equal(migrated.conversations.listAllMessagesForBuffer('buffer')[0]?.id,'one');
  migrated.close();
  const check=openSqliteDatabase(path); assert.deepEqual(check.prepare('PRAGMA foreign_key_check').all(),[]); check.close();
});

test('identity learned from a message protects an initially nickname-only conversation', () => {
  const {storage,network,add}=setup();
  const first=storage.conversations.upsertQuery(network.id,'same'); add('a','same',alice);
  const second=storage.conversations.upsertQuery(network.id,'same',bob);
  assert.notEqual(first.id,second.id);
  assert.equal(storage.conversations.getBuffer(first.id)?.peerIdentity?.value,'alice');
  assert.equal(storage.conversations.getBuffer(first.id)?.queryTargetAvailable,false);
  storage.close();
});

test('historical identity evidence cannot take a nickname away from its current owner', async () => {
  const {storage,network}=setup();
  const {appendConversationMessage}=await import('../server/runtime-conversation-store.js');
  const current=storage.conversations.upsertQuery(network.id,'same',bob);
  const historical=appendConversationMessage(storage.conversations,{message:{id:'past',networkId:network.id,target:'same',nick:'same',senderIdentity:alice,body:'past',kind:'line',self:false,ts:1,historical:true}});
  assert.notEqual(historical.saved.bufferId,current.id);
  assert.equal(storage.conversations.getBufferByTarget(network.id,'same')?.id,current.id);
  assert.equal(storage.conversations.getBuffer(historical.saved.bufferId!)?.queryTargetAvailable,false);
  assert.deepEqual(storage.conversations.listAllMessagesForBuffer(current.id),[]);
  storage.close();
});
