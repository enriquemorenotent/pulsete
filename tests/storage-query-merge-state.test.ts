import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage, makeStorageFile, openSqliteDatabase } from './helpers/storage-test-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';
import { upsertBuffer } from '../server/storage-buffers.js';
import { upsertQueryNickAlias } from '../server/storage-query-aliases.js';
import { upsertQueryPeerIdentity } from '../server/storage-query-identities.js';
import { migrateQueryNickAliases } from '../server/storage-query-alias-migration.js';
import { openRuntimeConversationQuery } from '../server/runtime-conversation-buffer-actions.js';
import { handleRuntimeConversationPeerNickEvent } from '../server/runtime-conversation-event-actions.js';
import { initialState, reducer } from '../web/src/app-state.js';
import { dispatchInboundServerMessage } from '../web/src/server-message-actions.js';
import { decodeServer } from '../shared/protocol-messages.js';

const account = (value: string) => ({ kind: 'account' as const, value });

for (const draft of ['only destination', 'identical', 'different']) {
  test(`nick-change merge preserves notes and ${draft} drafts across restart`, () => {
    const path = makeStorageFile();
    const storage = new Storage(path);
    const network = storage.networks.upsert(createNetworkInput());
    const first = storage.conversations.upsertQuery(network.id, 'first');
    const second = storage.conversations.upsertQuery(network.id, 'second');
    storage.conversations.setBufferNotes(first.id, 'first notes');
    storage.conversations.setBufferNotes(second.id, 'second notes');
    storage.drafts.save(second.id, 'second draft');
    if (draft !== 'only destination') storage.drafts.save(first.id, draft === 'identical' ? 'second draft' : 'first draft');
    const merged = storage.conversations.recordObservedQueryNickChange(network.id, 'first', 'second')!;
    if (draft === 'different') {
      assert.deepEqual(merged.removedBufferIds, []);
      assert.equal(merged.displacedBuffers?.[0]?.id, second.id);
      assert.equal(storage.conversations.getBuffer(second.id)?.queryTargetAvailable, false);
    } else {
      assert.deepEqual(merged.removedBufferIds, [second.id]);
      assert.ok(merged.buffer.notes?.includes('first notes'));
      assert.ok(merged.buffer.notes?.includes('second notes'));
    }
    storage.close();
    const reopened = new Storage(path);
    if (draft === 'different') {
      assert.equal(reopened.drafts.get(first.id)?.body, 'first draft');
      assert.equal(reopened.drafts.get(second.id)?.body, 'second draft');
      assert.equal(reopened.conversations.getBuffer(first.id)?.notes, 'first notes');
      assert.equal(reopened.conversations.getBuffer(second.id)?.notes, 'second notes');
    } else assert.equal(reopened.drafts.get(first.id)?.body, 'second draft');
    reopened.close();
  });
}

for (const conflict of [false, true]) test(`identity merge ${conflict ? 'separates conflicting' : 'moves destination'} drafts without losing notes`, () => {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const original = storage.conversations.upsertQuery(network.id, 'old', account('peer'));
  storage.conversations.setBufferNotes(original.id, 'old notes');
  storage.close();
  const db = openSqliteDatabase(path);
  const destination = upsertBuffer(db, { networkId: network.id, target: 'new', kind: 'query', notes: 'new notes' });
  upsertQueryPeerIdentity(db, { bufferId: destination.id, networkId: network.id,
    nick: 'new', identity: account('peer'), source: 'manual' });
  db.close();
  const reopened = new Storage(path);
  reopened.drafts.save(destination.id, 'new draft');
  if (conflict) reopened.drafts.save(original.id, 'old draft');
  // Make the message-bearing original the canonical conversation.
  reopened.conversations.appendMessage({ id: 'old-message', networkId: network.id, target: 'old',
    nick: 'old', body: 'old', kind: 'line', self: false, ts: 1 }, original.id);
  const result = reopened.conversations.upsertQueryWithMergeResult(network.id, 'new', account('peer'));
  assert.equal(result.buffer.id, original.id);
  if (conflict) {
    assert.deepEqual(result.removedBufferIds, []);
    assert.equal(reopened.drafts.get(original.id)?.body, 'old draft');
    assert.equal(reopened.drafts.get(destination.id)?.body, 'new draft');
    assert.equal(result.displacedBuffers?.[0]?.id, destination.id);
  } else {
    assert.deepEqual(result.removedBufferIds, [destination.id]);
    assert.ok(result.buffer.notes?.includes('old notes'));
    assert.ok(result.buffer.notes?.includes('new notes'));
    assert.equal(reopened.drafts.get(original.id)?.body, 'new draft');
  }
  reopened.close();
});

test('message-free duplicate notes and draft survive alias reopening and legacy cleanup', () => {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const original = storage.conversations.upsertQuery(network.id, 'old');
  storage.conversations.appendMessage({ id: 'old-message', networkId: network.id, target: 'old',
    nick: 'old', body: 'old', kind: 'line', self: false, ts: 1 });
  storage.conversations.setBufferNotes(original.id, 'old notes');
  storage.close();
  const db = openSqliteDatabase(path);
  upsertQueryNickAlias(db, { networkId: network.id, bufferId: original.id, nick: 'new', source: 'nick-change' });
  const duplicate = upsertBuffer(db, { networkId: network.id, target: 'new', kind: 'query', notes: 'new notes' });
  db.prepare('INSERT INTO buffer_drafts (bufferId, body, updatedAt) VALUES (?, ?, ?)').run(duplicate.id, 'draft', 1);
  migrateQueryNickAliases(db);
  assert.ok(db.prepare('SELECT id FROM buffers WHERE id = ?').get(duplicate.id));
  db.close();
  const reopened = new Storage(path);
  const result = reopened.conversations.upsertQueryWithMergeResult(network.id, 'new');
  assert.equal(result.buffer.id, original.id);
  assert.ok(result.buffer.notes?.includes('old notes'));
  assert.ok(result.buffer.notes?.includes('new notes'));
  assert.equal(reopened.drafts.get(original.id)?.body, 'draft');
  reopened.close();
});

test('nickname-only opening cannot merge an empty conversation with a conflicting account history', () => {
  const path = makeStorageFile();
  const storage = new Storage(path);
  const network = storage.networks.upsert(createNetworkInput());
  const original = storage.conversations.upsertQuery(network.id, 'old', account('alice'));
  storage.conversations.appendMessage({ id: 'old-message', networkId: network.id, target: 'old',
    nick: 'old', body: 'old', kind: 'line', self: false, ts: 1 });
  const other = storage.conversations.upsertQuery(network.id, 'new', account('bob'));
  storage.conversations.setBufferNotes(other.id, 'Bob notes');
  storage.close();
  const db = openSqliteDatabase(path);
  upsertQueryNickAlias(db, { networkId: network.id, bufferId: original.id, nick: 'new', source: 'nick-change' });
  db.close();
  const reopened = new Storage(path);
  const result = reopened.conversations.upsertQuery(network.id, 'new');
  assert.equal(result.id, other.id);
  assert.equal(result.notes, 'Bob notes');
  assert.equal(reopened.conversations.getBuffer(original.id)?.target, 'old');
  reopened.close();
});

for (const action of ['open', 'nick-change']) test(`${action} merge publishes the moved draft to the open client`, () => {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  const original = storage.conversations.upsertQuery(network.id, 'old', account('peer'));
  storage.conversations.appendMessage({ id: 'old-message', networkId: network.id, target: 'old',
    nick: 'old', body: 'old', kind: 'line', self: false, ts: 1 });
  const other = storage.conversations.upsertQuery(network.id, 'new');
  const draft = storage.drafts.save(other.id, 'unsent text')!;
  let state = reducer(initialState, { type: 'upsert-buffer', buffer: original });
  state = reducer(state, { type: 'upsert-buffer', buffer: other });
  dispatchInboundServerMessage({ type: 'draft.upsert', draft }, update => { state = reducer(state, update); });
  const options = { conversations: storage.conversations, networks: storage.networks,
    mutedNicks: storage.mutedNicks, drafts: storage.drafts };
  const messages = action === 'open'
    ? openRuntimeConversationQuery(options, network.id, 'new', account('peer')).messages
    : handleRuntimeConversationPeerNickEvent(options, {
      type: 'peer-nick', networkId: network.id, oldNick: 'old', newNick: 'new', self: false,
    });
  for (const message of messages) dispatchInboundServerMessage(decodeServer(JSON.stringify(message)),
    update => { state = reducer(state, update); });
  assert.equal(state.domain.drafts.find(d => d.bufferId === original.id)?.body, 'unsent text');
  assert.equal(state.domain.drafts.find(d => d.bufferId === other.id), undefined);
  storage.close();
});
