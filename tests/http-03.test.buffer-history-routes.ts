import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { historyWindowLimit } from '../shared/protocol.js';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('buffer read emits updates and clears unread counts without auth', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  const network = context.storage.networks.upsert(createNetworkInput());
  const channel = context.storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    unread: 0,
  });

  try {
    const unreadBufferPromise = waitForWebSocketMessageType(context.socket!, 'buffer.upsert');
    handleRuntimeEvent({ store: context.storage, publish: context.runtime.gateway.publish }, {
      type: 'message',
      message: {
        id: 'msg-1',
        networkId: network.id,
        target: '#help',
        nick: 'bob',
        body: 'hello',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    });

    const unreadBuffer = await unreadBufferPromise as { buffer: { id: string; unread: number } };
    assert.equal(unreadBuffer.buffer.id, channel.id);
    assert.equal(unreadBuffer.buffer.unread, 1);

    const clearedBufferPromise = waitForWebSocketMessageType(context.socket!, 'buffer.upsert');
    const response = await requestJson(context.port, 'POST', `/api/buffers/${channel.id}/read`, {});
    assert.equal(response.status, 200);

    const clearedBuffer = await clearedBufferPromise as { buffer: { id: string; unread: number } };
    assert.equal(clearedBuffer.buffer.id, channel.id);
    assert.equal(clearedBuffer.buffer.unread, 0);
  } finally {
    await context.close();
  }
});

test('history clamps invalid and oversized limits to the default window', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());
  const buffer = context.storage.conversations.upsertBuffer({
    networkId: network.id,
    kind: 'channel',
    target: '#help',
  });
  for (let index = 0; index < 250; index += 1) {
    context.storage.conversations.appendMessage({
      id: `m${index}`,
      networkId: network.id,
      target: '#help',
      nick: 'alice',
      body: `message ${index}`,
      kind: 'line',
      self: true,
      ts: Date.now() + index,
    });
  }

  try {
    const invalidLimit = await fetch(`http://127.0.0.1:${context.port}/api/buffers/${buffer.id}/history?limit=-1`);
    const invalidBody = await invalidLimit.json() as { hasMore: boolean; messages: Array<{ body: string }> };
    assert.equal(invalidLimit.status, 200);
    assert.equal(invalidBody.messages.length, historyWindowLimit);
    assert.equal(invalidBody.hasMore, false);
    assert.equal(invalidBody.messages[0]?.body, 'message 0');
    assert.equal(invalidBody.messages.at(-1)?.body, 'message 249');

    const oversizedLimit =
      await fetch(`http://127.0.0.1:${context.port}/api/buffers/${buffer.id}/history?limit=1000000`);
    const oversizedBody = await oversizedLimit.json() as { hasMore: boolean; messages: Array<{ body: string }> };
    assert.equal(oversizedLimit.status, 200);
    assert.equal(oversizedBody.messages.length, historyWindowLimit);
    assert.equal(oversizedBody.hasMore, false);
    assert.equal(oversizedBody.messages[0]?.body, 'message 0');
    assert.equal(oversizedBody.messages.at(-1)?.body, 'message 249');
  } finally {
    await context.close();
  }
});
