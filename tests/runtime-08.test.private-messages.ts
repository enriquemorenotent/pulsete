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
