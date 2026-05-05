import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { historyWindowLimit } from '../shared/protocol-chat.js';
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

test('buffer history search returns scoped hits with nearby context', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());
  const buffer = context.storage.conversations.upsertBuffer({
    networkId: network.id,
    kind: 'channel',
    target: '#help',
  });
  for (let index = 0; index < 5; index += 1) {
    context.storage.conversations.appendMessage({
      id: `m${index}`,
      networkId: network.id,
      target: '#help',
      nick: 'alice',
      body: index === 2 ? 'needle line' : `context line ${index}`,
      kind: 'line',
      self: false,
      ts: Date.now() + index,
    });
  }
  context.storage.conversations.appendMessage({
    id: 'other-buffer',
    networkId: network.id,
    target: '#other',
    nick: 'alice',
    body: 'needle line elsewhere',
    kind: 'line',
    self: false,
    ts: Date.now() + 10,
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${context.port}/api/buffers/${buffer.id}/history/search?q=needle&limit=10`,
    );
    const body = await response.json() as {
      query: string;
      hasMore: boolean;
      results: Array<{ message: { id: string }; context: Array<{ id: string }> }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.query, 'needle');
    assert.equal(body.hasMore, false);
    assert.deepEqual(body.results.map((result) => result.message.id), ['m2']);
    assert.deepEqual(body.results[0]?.context.map((message) => message.id), ['m0', 'm1', 'm2', 'm3', 'm4']);
  } finally {
    await context.close();
  }
});

test('log search returns hits across stored buffers with nearby context and filters', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());
  for (let index = 0; index < 5; index += 1) {
    context.storage.conversations.appendMessage({
      id: `log-help-${index}`,
      networkId: network.id,
      target: '#help',
      nick: 'alice',
      body: index === 2 ? 'global needle line' : `help context ${index}`,
      kind: 'line',
      self: false,
      ts: Date.now() + index,
    });
  }
  context.storage.conversations.appendMessage({
    id: 'log-query-hit',
    networkId: network.id,
    target: 'MissD',
    nick: 'alice',
    body: 'global needle private',
    kind: 'line',
    self: false,
    ts: Date.now() + 10,
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${context.port}/api/logs/search?q=global%20needle&limit=10`,
    );
    const body = await response.json() as {
      query: string;
      networkId: string | null;
      target: string | null;
      hasMore: boolean;
      results: Array<{ message: { id: string; target: string }; context: Array<{ id: string }> }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.query, 'global needle');
    assert.equal(body.networkId, null);
    assert.equal(body.target, null);
    assert.deepEqual(body.results.map((result) => result.message.id), ['log-query-hit', 'log-help-2']);
    assert.deepEqual(body.results[1]?.context.map((message) => message.id), [
      'log-help-0',
      'log-help-1',
      'log-help-2',
      'log-help-3',
      'log-help-4',
    ]);

    const filtered = await fetch(
      `http://127.0.0.1:${context.port}/api/logs/search?q=global%20needle&target=help`,
    );
    const filteredBody = await filtered.json() as { results: Array<{ message: { id: string } }> };
    assert.equal(filtered.status, 200);
    assert.deepEqual(filteredBody.results.map((result) => result.message.id), ['log-help-2']);
  } finally {
    await context.close();
  }
});

test('buffer history search handles empty, capped, missing, and server-buffer searches', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());
  const channelBuffer = context.storage.conversations.upsertBuffer({
    networkId: network.id,
    kind: 'channel',
    target: '#help',
  });
  const serverBuffer = context.storage.conversations.upsertBuffer({
    networkId: network.id,
    kind: 'server',
    target: 'server',
  });
  for (let index = 0; index < 3; index += 1) {
    context.storage.conversations.appendMessage({
      id: `hit-${index}`,
      networkId: network.id,
      target: '#help',
      nick: 'alice',
      body: 'needle',
      kind: 'line',
      self: false,
      ts: Date.now() + index,
    });
  }

  try {
    const empty = await fetch(`http://127.0.0.1:${context.port}/api/buffers/${channelBuffer.id}/history/search?q=`);
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { query: '', results: [], hasMore: false });

    const capped = await fetch(
      `http://127.0.0.1:${context.port}/api/buffers/${channelBuffer.id}/history/search?q=needle&limit=1`,
    );
    const cappedBody = await capped.json() as { hasMore: boolean; results: Array<{ message: { id: string } }> };
    assert.equal(capped.status, 200);
    assert.deepEqual(cappedBody.results.map((result) => result.message.id), ['hit-2']);
    assert.equal(cappedBody.hasMore, true);

    const missing = await fetch(`http://127.0.0.1:${context.port}/api/buffers/missing/history/search?q=needle`);
    assert.equal(missing.status, 404);

    const server = await fetch(`http://127.0.0.1:${context.port}/api/buffers/${serverBuffer.id}/history/search?q=needle`);
    assert.equal(server.status, 400);
  } finally {
    await context.close();
  }
});
