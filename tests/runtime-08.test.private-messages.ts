import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createRuntimeEventHarness } from './helpers/runtime-conversation-event-helpers.js';

test('incoming private messages open query buffers automatically', () => {
  const harness = createRuntimeEventHarness();

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'helper',
      body: 'hello there',
      kind: 'line',
      self: false,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper')?.target, 'helper');
  assert.ok(harness.sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(harness.sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper'),
  });
});

test('incoming private messages reuse an existing query buffer across IRC nick casing', () => {
  const harness = createRuntimeEventHarness();
  const existingQuery = harness.storage.conversations.upsertQuery(harness.network.id, 'Alice');

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'alice',
      nick: 'alice',
      body: 'hello again',
      kind: 'line',
      self: false,
      ts: Date.now(),
    },
  });

  const queryCount = harness.storage.conversations
    .listBuffers(harness.network.id)
    .filter((buffer) => buffer.kind === 'query').length;
  assert.equal(queryCount, 1);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'ALICE')?.id, existingQuery.id);
  assert.deepEqual(harness.sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: harness.storage.conversations.getBuffer(existingQuery.id),
  });
});

test('incoming private messages reuse account identity when nick changes were missed', () => {
  const harness = createRuntimeEventHarness();
  const query = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'helper',
      senderIdentity: { kind: 'account', value: 'helper-account' },
      body: 'before rename',
      kind: 'line',
      self: false,
      ts: 1,
    },
  });
  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'guide',
      nick: 'guide',
      senderIdentity: { kind: 'account', value: 'helper-account' },
      body: 'after missed nick event',
      kind: 'line',
      self: false,
      ts: 2,
    },
  });

  const queryBuffers = harness.storage.conversations
    .listBuffers(harness.network.id)
    .filter((buffer) => buffer.kind === 'query');
  assert.equal(queryBuffers.length, 1);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'guide')?.id, query.id);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'guide', 10).map((message) => message.body),
    ['before rename', 'helper is now known as guide', 'after missed nick event'],
  );
  assert.deepEqual(
    harness.sent
      .filter((message) => message.type === 'message.append')
      .map((message) => (message.message as { body: string }).body),
    ['before rename', 'helper is now known as guide', 'after missed nick event'],
  );
  assert.deepEqual(
    harness.storage.conversations.getBuffer(query.id)?.peerIdentity,
    { kind: 'account', value: 'helper-account' },
  );
});

test('incoming private messages reuse userhost identity when account is unavailable', () => {
  const harness = createRuntimeEventHarness();
  const query = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'helper',
      senderIdentity: { kind: 'userhost', value: 'helper@users.example' },
      body: 'before rename',
      kind: 'line',
      self: false,
      ts: 1,
    },
  });
  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'guide',
      nick: 'guide',
      senderIdentity: { kind: 'userhost', value: 'helper@users.example' },
      body: 'after missed nick event',
      kind: 'line',
      self: false,
      ts: 2,
    },
  });

  const queryBuffers = harness.storage.conversations
    .listBuffers(harness.network.id)
    .filter((buffer) => buffer.kind === 'query');
  assert.equal(queryBuffers.length, 1);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'guide')?.id, query.id);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'guide', 10).map((message) => message.body),
    ['before rename', 'helper is now known as guide', 'after missed nick event'],
  );
  assert.deepEqual(
    harness.storage.conversations.getBuffer(query.id)?.peerIdentity,
    { kind: 'userhost', value: 'helper@users.example' },
  );
});

test('incoming private messages merge duplicate query buffers that share account identity', () => {
  const harness = createRuntimeEventHarness();
  const originalQuery = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');
  const renamedQuery = harness.storage.conversations.upsertQuery(harness.network.id, 'guide');

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'helper',
      senderIdentity: { kind: 'account', value: 'helper-account' },
      body: 'old window',
      kind: 'line',
      self: false,
      ts: 1,
    },
  });
  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'guide',
      nick: 'guide',
      senderIdentity: { kind: 'account', value: 'helper-account' },
      body: 'new window',
      kind: 'line',
      self: false,
      ts: 2,
    },
  });

  const queryBuffers = harness.storage.conversations
    .listBuffers(harness.network.id)
    .filter((buffer) => buffer.kind === 'query');
  assert.equal(queryBuffers.length, 1);
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'guide')?.id, originalQuery.id);
  assert.equal(harness.storage.conversations.getBuffer(renamedQuery.id), null);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'guide', 10).map((message) => message.body),
    ['old window', 'helper is now known as guide', 'new window'],
  );
  assert.deepEqual(harness.sent.find((message) => message.type === 'buffer.remove'), {
    type: 'buffer.remove',
    networkId: harness.network.id,
    bufferId: renamedQuery.id,
    replacementBufferId: originalQuery.id,
  });
});

test('self-sent private messages open query buffers automatically', () => {
  const harness = createRuntimeEventHarness();

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'tester',
      body: 'hello there',
      kind: 'line',
      self: true,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper')?.kind, 'query');
  assert.ok(harness.sent.some((message) => message.type === 'message.append'));
  assert.equal(
    harness.sent.some((message) => {
      const buffer = message.buffer as { kind?: string } | undefined;
      return message.type === 'buffer.upsert' && buffer?.kind === 'query';
    }),
    true
  );
});

test('self-sent private messages do not retarget an identity-polluted query buffer', () => {
  const harness = createRuntimeEventHarness();
  const pollutedQuery = harness.storage.conversations.upsertQuery(
    harness.network.id,
    'oldPeer',
    { kind: 'account', value: 'tester' },
  );
  const selectedQuery = harness.storage.conversations.upsertQuery(harness.network.id, 'alicia');

  harness.publishEvent({
    type: 'message',
    currentNick: 'tester',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'alicia',
      nick: 'tester',
      senderIdentity: { kind: 'account', value: 'tester' },
      body: 'Hi',
      kind: 'line',
      self: true,
      ts: Date.now(),
    },
  });

  const appended = harness.sent.find((message) => message.type === 'message.append')?.message as
    | { bufferId?: string; target?: string }
    | undefined;
  assert.equal(appended?.bufferId, selectedQuery.id);
  assert.equal(appended?.target, 'alicia');
  assert.equal(harness.storage.conversations.getBuffer(pollutedQuery.id)?.target, 'oldPeer');
  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'alicia')?.id, selectedQuery.id);
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'alicia', 10).map((message) => message.body),
    ['Hi'],
  );
  assert.deepEqual(harness.storage.conversations.listMessages(harness.network.id, 'oldPeer', 10), []);
  assert.equal(harness.sent.some((message) => message.type === 'buffer.remove'), false);
});

test('incoming private messages from muted nicks stay in history without opening a query buffer', () => {
  const harness = createRuntimeEventHarness();
  harness.storage.mutedNicks.upsert({ networkId: harness.network.id, nick: 'helper' });

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'HELPER',
      body: 'hello there',
      kind: 'line',
      self: false,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper'), null);
  assert.equal(harness.storage.conversations.listMessages(harness.network.id, 'helper', 10)[0]?.body, 'hello there');
  assert.equal(harness.sent.some((message) => message.type === 'message.append'), true);
  assert.equal(harness.sent.some((message) => message.type === 'buffer.upsert'), false);
});

test('incoming private messages from muted account identity stay muted after nick changes', () => {
  const harness = createRuntimeEventHarness();
  harness.storage.mutedNicks.upsert({
    networkId: harness.network.id,
    nick: 'helper',
    identity: { kind: 'account', value: 'helper-account' },
  });

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper_',
      nick: 'helper_',
      senderIdentity: { kind: 'account', value: 'helper-account' },
      body: 'new nick, same account',
      kind: 'line',
      self: false,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper_'), null);
  assert.equal(
    harness.storage.conversations.listMessages(harness.network.id, 'helper_', 10)[0]?.body,
    'new nick, same account',
  );
  assert.equal(harness.sent.some((message) => message.type === 'buffer.upsert'), false);
});

test('private action messages open query buffers automatically', () => {
  const harness = createRuntimeEventHarness();

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'helper',
      body: 'waves',
      kind: 'action',
      self: false,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper')?.kind, 'query');
  assert.equal(harness.storage.conversations.listMessages(harness.network.id, 'helper', 5)[0]?.kind, 'action');
  assert.ok(harness.sent.some((message) => message.type === 'message.append'));
});

test('routed private notices stay in the selected query when the sender has its own identity buffer', () => {
  const harness = createRuntimeEventHarness();
  const dataQuery = harness.storage.conversations.upsertQuery(
    harness.network.id,
    'Data',
    { kind: 'account', value: 'data' },
  );
  harness.storage.conversations.removeBuffer(dataQuery.id);
  const selectedQuery = harness.storage.conversations.upsertQuery(harness.network.id, 'Lez-Ali');

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'Lez-Ali',
      nick: 'Data',
      senderIdentity: { kind: 'account', value: 'data' },
      body: 'profile reply',
      kind: 'notice',
      self: false,
      ts: Date.now(),
    },
  });

  const appended = harness.sent.find((message) => message.type === 'message.append')?.message as
    | { bufferId?: string; target?: string }
    | undefined;
  assert.equal(appended?.bufferId, selectedQuery.id);
  assert.equal(appended?.target, 'Lez-Ali');
  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, 'Lez-Ali', 10).map((message) => message.body),
    ['profile reply'],
  );
  assert.deepEqual(harness.storage.conversations.listMessages(harness.network.id, 'Data', 10), []);
});
