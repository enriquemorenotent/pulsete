import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createRuntimeEventHarness } from './helpers/runtime-conversation-event-helpers.js';

test('direct user notices append to an open private message buffer', () => {
  const harness = createRuntimeEventHarness();
  const query = harness.storage.conversations.upsertQuery(harness.network.id, 'helper');

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'helper',
      body: 'heads up',
      kind: 'notice',
      self: false,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.listMessages(harness.network.id, 'helper', 10)[0]?.body, 'heads up');
  assert.equal(harness.storage.conversations.listMessages(harness.network.id, 'server', 10).length, 0);
  assert.deepEqual(harness.sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: harness.storage.conversations.getBuffer(query.id),
  });
});

test('direct user notices fall back to the server buffer when no private message is open', () => {
  const harness = createRuntimeEventHarness();

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'helper',
      nick: 'helper',
      body: 'heads up',
      kind: 'notice',
      self: false,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'helper'), null);
  assert.equal(harness.storage.conversations.listMessages(harness.network.id, 'helper', 10).length, 0);
  assert.equal(harness.storage.conversations.listMessages(harness.network.id, 'server', 10)[0]?.body, 'heads up');
  assert.deepEqual(harness.sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: harness.storage.conversations.getServerBuffer(harness.network.id),
  });
});

test('service messages on the server buffer close stale service queries', () => {
  const harness = createRuntimeEventHarness();
  const query = harness.storage.conversations.upsertQuery(harness.network.id, 'NickServ');

  harness.publishEvent({
    type: 'message',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'server',
      nick: 'NickServ',
      body: 'Use IDENTIFY first',
      kind: 'line',
      self: false,
      ts: Date.now(),
    },
  });

  assert.equal(harness.storage.conversations.getBufferByTarget(harness.network.id, 'NickServ'), null);
  assert.ok(harness.sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(harness.sent.find((message) => message.type === 'buffer.remove'), {
    type: 'buffer.remove',
    networkId: harness.network.id,
    bufferId: query.id,
  });
});
