import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createRuntimeEventHarness } from './helpers/runtime-conversation-event-helpers.js';

test('peer nick events retarget an open private message buffer and preserve transcript continuity', () => {
  const harness = createRuntimeEventHarness();
  const query = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');
  harness.storage.conversations.appendMessage({
    id: 'before-nick-change',
    networkId: harness.network.id,
    target: 'helper',
    nick: 'helper',
    body: 'before rename',
    kind: 'line',
    self: false,
    ts: 1,
  });

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'helper',
    newNick: 'guide',
    self: false,
  });
  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'guide',
      nick: 'guide',
      body: 'after rename',
      kind: 'line',
      self: false,
      ts: 2,
    },
  });

  const queryCount = harness.storage.conversations
    .listBuffers(harness.network.id)
    .filter((buffer) => buffer.kind === 'query').length;
  assert.equal(queryCount, 1);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'guide')?.id, query.id);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper'), null);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'guide', 10).map((message) => ({
      target: message.target,
      body: message.body,
    })),
    [
      { target: 'guide', body: 'before rename' },
      { target: 'guide', body: 'after rename' },
      { target: 'guide', body: 'helper is now known as guide' },
    ],
  );
  assert.ok(harness.sent.some((message) =>
    message.type === 'buffer.upsert'
    && (message.buffer as { id?: string; target?: string } | undefined)?.id === query.id
    && (message.buffer as { target?: string } | undefined)?.target === 'guide'
  ));
});

test('query opens reuse observed nick-change aliases after the current nick changes', () => {
  const harness = createRuntimeEventHarness();
  const query = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');
  harness.storage.conversations.appendMessage({
    id: 'before-alias-open',
    networkId: harness.network.id,
    target: 'helper',
    nick: 'helper',
    body: 'before rename',
    kind: 'line',
    self: false,
    ts: 1,
  });

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'helper',
    newNick: 'guide',
    self: false,
  });

  const reopened = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');
  const messages = harness.storage.conversations.listMessages(harness.network.id, 'helper', 10);

  assert.equal(reopened.id, query.id);
  assert.equal(reopened.target, 'helper');
  assert.deepEqual(messages.map((message) => message.body), [
    'before rename',
    'helper is now known as guide',
  ]);
});

test('peer nick events merge an existing destination query buffer into the original private message', () => {
  const harness = createRuntimeEventHarness();
  const originalQuery = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');
  const renamedQuery = harness.storage.conversations.upsertQuery(harness.network.id, 'guide');
  harness.storage.conversations.setBufferUnread(originalQuery.id, 1, 1);
  harness.storage.conversations.setBufferUnread(renamedQuery.id, 2, 0);
  harness.storage.conversations.appendMessage({
    id: 'old-query-message',
    networkId: harness.network.id,
    target: 'helper',
    nick: 'helper',
    body: 'old buffer',
    kind: 'line',
    self: false,
    ts: 1,
  });
  harness.storage.conversations.appendMessage({
    id: 'new-query-message',
    networkId: harness.network.id,
    target: 'guide',
    nick: 'guide',
    body: 'new buffer',
    kind: 'line',
    self: false,
    ts: 2,
  });

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'helper',
    newNick: 'guide',
    self: false,
  });

  const queryCount = harness.storage.conversations
    .listBuffers(harness.network.id)
    .filter((buffer) => buffer.kind === 'query').length;
  assert.equal(queryCount, 1);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'guide')?.id, originalQuery.id);
  assert.equal(harness.storage.conversations.getBuffer(renamedQuery.id), null);
  assert.equal(harness.storage.conversations.getBuffer(originalQuery.id)?.unread, 3);
  assert.equal(harness.storage.conversations.getBuffer(originalQuery.id)?.priorityUnread, 1);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'guide', 10).map((message) => message.body),
    ['old buffer', 'new buffer', 'helper is now known as guide'],
  );
  assert.deepEqual(harness.sent.find((message) => message.type === 'buffer.remove'), {
    type: 'buffer.remove',
    networkId: harness.network.id,
    bufferId: renamedQuery.id,
  });
});

test('self nick events do not retarget peer private messages', () => {
  const harness = createRuntimeEventHarness();
  const query = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');
  harness.storage.conversations.appendMessage({
    id: 'peer-message-before-self-nick',
    networkId: harness.network.id,
    target: 'helper',
    nick: 'helper',
    body: 'peer message',
    kind: 'line',
    self: false,
    ts: 1,
  });

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'tester',
    newNick: 'tester_',
    self: true,
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper')?.id, query.id);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'tester_'), null);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'helper', 10).map((message) => message.body),
    ['peer message'],
  );
});

test('peer nick events without an existing query do not create a private message buffer', () => {
  const harness = createRuntimeEventHarness();

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'helper',
    newNick: 'guide',
    self: false,
  });

  const queryBuffers = harness.storage.conversations
    .listBuffers(harness.network.id)
    .filter((buffer) => buffer.kind === 'query');
  assert.deepEqual(queryBuffers, []);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'server', 10).map((message) => message.body),
    ['helper is now known as guide'],
  );
});
