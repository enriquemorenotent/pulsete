import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { listen,requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('history can load older pages before the oldest visible message', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertBuffer({ networkId: network.id, kind: 'channel', target: '#help' });
  for (let index = 0; index < 300; index += 1) {
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
    const latestResponse = await fetch(`http://127.0.0.1:${port}/api/buffers/${buffer.id}/history?limit=120`);
    const latestBody = await latestResponse.json() as {
      hasMore: boolean;
      messages: Array<{ body: string; id: string }>;
    };
    assert.equal(latestResponse.status, 200);
    assert.equal(latestBody.hasMore, true);
    assert.equal(latestBody.messages.length, 120);
    assert.equal(latestBody.messages[0]?.body, 'message 180');
    assert.equal(latestBody.messages.at(-1)?.body, 'message 299');

    const olderResponse = await fetch(
      `http://127.0.0.1:${port}/api/buffers/${buffer.id}/history?limit=120&before=${encodeURIComponent(latestBody.messages[0]!.id)}`
    );
    const olderBody = await olderResponse.json() as {
      hasMore: boolean;
      messages: Array<{ body: string; id: string }>;
    };
    assert.equal(olderResponse.status, 200);
    assert.equal(olderBody.hasMore, true);
    assert.equal(olderBody.messages.length, 120);
    assert.equal(olderBody.messages[0]?.body, 'message 60');
    assert.equal(olderBody.messages.at(-1)?.body, 'message 179');

    const oldestResponse = await fetch(
      `http://127.0.0.1:${port}/api/buffers/${buffer.id}/history?limit=120&before=${encodeURIComponent(olderBody.messages[0]!.id)}`
    );
    const oldestBody = await oldestResponse.json() as {
      hasMore: boolean;
      messages: Array<{ body: string }>;
    };
    assert.equal(oldestResponse.status, 200);
    assert.equal(oldestBody.hasMore, false);
    assert.equal(oldestBody.messages.length, 60);
    assert.equal(oldestBody.messages[0]?.body, 'message 0');
    assert.equal(oldestBody.messages.at(-1)?.body, 'message 59');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('buffer history download returns a human-readable transcript attachment', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput({ name: 'DownloadNet' }));
  const buffer = storage.conversations.upsertBuffer({ networkId: network.id, kind: 'query', target: 'MissD' });
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: 'MissD',
    nick: 'MissD',
    body: 'hello there',
    kind: 'line',
    self: false,
    ts: Date.UTC(2026, 2, 24, 18, 0, 0),
  });
  storage.conversations.appendMessage({
    id: 'message-2',
    networkId: network.id,
    target: 'MissD',
    nick: 'sofia',
    body: 'waves',
    kind: 'action',
    self: true,
    ts: Date.UTC(2026, 2, 24, 18, 1, 0),
  });
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/buffers/${buffer.id}/history/download`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename="history-downloadnet-missd\.txt"/);
    assert.match(body, /Buffer: MissD/);
    assert.match(body, /Type: query/);
    assert.match(body, /Network: DownloadNet/);
    assert.match(body, /Total messages: 2/);
    assert.match(body, /\[2026-03-24 18:00\] MissD: hello there/);
    assert.match(body, /\[2026-03-24 18:01\] \* sofia waves/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('buffer history clear removes channel transcript rows and broadcasts the mutation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput());
  const buffer = storage.conversations.upsertBuffer({ networkId: network.id, kind: 'channel', target: '#help', unread: 2 });
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: '#help',
    nick: 'alice',
    body: 'hello',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'message-2',
    networkId: network.id,
    target: '#HELP',
    nick: 'tester',
    body: 'hi',
    kind: 'line',
    self: true,
    ts: 2,
  });
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const removedPromise = waitForWebSocketMessageType(socket, 'message.remove');
    const bufferPromise = waitForWebSocketMessageType(socket, 'buffer.upsert');
    const response = await requestJson(port, 'DELETE', `/api/buffers/${buffer.id}/history`, {});

    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.deepEqual((response.json.messages as Array<{ type: string }>).map((message) => message.type), [
      'message.remove',
      'buffer.upsert',
    ]);

    const removed = await removedPromise as { networkId: string; target: string; messageIds: string[] };
    const updatedBuffer = await bufferPromise as { buffer: { id: string; unread: number } };

    assert.equal(removed.networkId, network.id);
    assert.equal(removed.target, '#help');
    assert.deepEqual(removed.messageIds, ['message-1', 'message-2']);
    assert.equal(updatedBuffer.buffer.id, buffer.id);
    assert.equal(updatedBuffer.buffer.unread, 0);
    assert.deepEqual(storage.conversations.listMessages(network.id, '#help', 10), []);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

