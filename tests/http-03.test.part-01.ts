import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { historyWindowLimit } from '../shared/protocol.js';
import { listen,requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('friend routes persist entries and broadcast updates without auth', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput());
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const addMessagePromise = waitForWebSocketMessageType(socket, 'friend.upsert');
    const presenceMessagePromise = waitForWebSocketMessageType(socket, 'friend.presence');
    const createResponse = await requestJson(port, 'POST', '/api/friends', { nick: 'Alice' });
    assert.equal(createResponse.status, 200);
    assert.equal((createResponse.json.friend as { nick: string }).nick, 'Alice');

    const addMessage = await addMessagePromise as {
      friend: { id: string; nick: string };
    };
    assert.equal(addMessage.friend.nick, 'Alice');
    const presenceMessage = await presenceMessagePromise as {
      friendId: string;
      presence: string;
    };
    assert.equal(presenceMessage.friendId, addMessage.friend.id);
    assert.equal(presenceMessage.presence, 'offline');

    const duplicateResponse = await requestJson(port, 'POST', '/api/friends', { nick: 'alice' });
    assert.equal(duplicateResponse.status, 200);
    assert.equal((duplicateResponse.json.friend as { id: string }).id, addMessage.friend.id);

    const existingQuery = storage.conversations.upsertQuery(network.id, 'Alice');
    assert.equal(existingQuery.target, 'Alice');

    const removeMessagePromise = waitForWebSocketMessageType(socket, 'friend.remove');
    const deleteResponse = await requestJson(port, 'DELETE', `/api/friends/${addMessage.friend.id}`);
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.json.ok, true);

    const removeMessage = await removeMessagePromise as { friendId: string };
    assert.equal(removeMessage.friendId, addMessage.friend.id);
    assert.equal(storage.friends.list().length, 0);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('friend routes validate payloads and targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const server = createServer(createHttpHandler(runtime.http));
  const port = await listen(server);

  try {
    const invalidPayload = await requestJson(port, 'POST', '/api/friends', { nick: {} });
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.json.message, 'Invalid friend payload');

    const invalidTarget = await requestJson(port, 'POST', '/api/friends', { nick: '#help' });
    assert.equal(invalidTarget.status, 400);
    assert.equal(invalidTarget.json.message, 'Private-message target is required');

    const reservedTarget = await requestJson(port, 'POST', '/api/friends', { nick: 'Server' });
    assert.equal(reservedTarget.status, 400);
    assert.equal(reservedTarget.json.message, 'Private-message target is required');

    const multipleTargets = await requestJson(port, 'POST', '/api/friends', { nick: 'alice,bob' });
    assert.equal(multipleTargets.status, 400);
    assert.equal(multipleTargets.json.message, 'Private-message target must refer to a single nick');

    const tooLongNick = await requestJson(port, 'POST', '/api/friends', { nick: 'x'.repeat(600) });
    assert.equal(tooLongNick.status, 400);
    assert.equal(tooLongNick.json.message, 'Friend nick is too long');

    const missingDelete = await requestJson(port, 'DELETE', '/api/friends/missing-friend');
    assert.equal(missingDelete.status, 404);
    assert.equal(missingDelete.json.message, 'Friend not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('buffer read emits updates and clears unread counts without auth', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput());
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    unread: 0,
  });
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const unreadBufferPromise = waitForWebSocketMessageType(socket, 'buffer.upsert');
    handleRuntimeEvent({ store: storage, publish: runtime.gateway.publish }, {
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

    const unreadBuffer = await unreadBufferPromise as {
      buffer: { id: string; unread: number };
    };
    assert.equal(unreadBuffer.buffer.id, channel.id);
    assert.equal(unreadBuffer.buffer.unread, 1);

    const clearedBufferPromise = waitForWebSocketMessageType(socket, 'buffer.upsert');
    const response = await requestJson(port, 'POST', `/api/buffers/${channel.id}/read`, {});
    assert.equal(response.status, 200);

    const clearedBuffer = await clearedBufferPromise as {
      buffer: { id: string; unread: number };
    };
    assert.equal(clearedBuffer.buffer.id, channel.id);
    assert.equal(clearedBuffer.buffer.unread, 0);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('history clamps invalid and oversized limits to the default window', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertBuffer({ networkId: network.id, kind: 'channel', target: '#help' });
  for (let index = 0; index < 250; index += 1) {
    storage.conversations.appendMessage({
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
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const invalidLimit = await fetch(`http://127.0.0.1:${port}/api/buffers/${buffer.id}/history?limit=-1`);
    const invalidBody = await invalidLimit.json() as { hasMore: boolean; messages: Array<{ body: string }> };
    assert.equal(invalidLimit.status, 200);
    assert.equal(invalidBody.messages.length, historyWindowLimit);
    assert.equal(invalidBody.hasMore, false);
    assert.equal(invalidBody.messages[0]?.body, 'message 0');
    assert.equal(invalidBody.messages.at(-1)?.body, 'message 249');

    const oversizedLimit = await fetch(`http://127.0.0.1:${port}/api/buffers/${buffer.id}/history?limit=1000000`);
    const oversizedBody = await oversizedLimit.json() as { hasMore: boolean; messages: Array<{ body: string }> };
    assert.equal(oversizedLimit.status, 200);
    assert.equal(oversizedBody.messages.length, historyWindowLimit);
    assert.equal(oversizedBody.hasMore, false);
    assert.equal(oversizedBody.messages[0]?.body, 'message 0');
    assert.equal(oversizedBody.messages.at(-1)?.body, 'message 249');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

