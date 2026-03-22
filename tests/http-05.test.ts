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
import { listen,requestJson,sendRawRequest } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket } from './helpers/http-websocket-test-helpers.js';

test('malformed request targets and route params return handled bad requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  storage.networks.upsert(createNetworkInput());
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    const invalidTargetResponse = await sendRawRequest(
      port,
      'GET http://% HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
    );
    assert.match(invalidTargetResponse, /^HTTP\/1\.1 400 Bad Request/m);
    assert.match(invalidTargetResponse, /Invalid request target/);

    const invalidParamResponse = await requestJson(port, 'POST', '/api/networks/%E0%A4%A/connect', {});
    assert.equal(invalidParamResponse.status, 400);
    assert.equal(invalidParamResponse.json.message, 'Invalid request parameter');

    const invalidQueryTarget = await requestJson(port, 'DELETE', '/api/buffers/%E0%A4%A');
    assert.equal(invalidQueryTarget.status, 400);
    assert.equal(invalidQueryTarget.json.message, 'Invalid request parameter');
    assert.equal(uncaught, null);
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('malformed websocket upgrade targets are destroyed without uncaught exceptions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    await sendRawRequest(
      port,
      [
        'GET http://% HTTP/1.1',
        'Host: 127.0.0.1',
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n')
    );
    assert.equal(uncaught, null);
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('oversized json bodies are rejected before parsing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      realName: 'x'.repeat(70_000),
    });
    assert.equal(response.status, 413);
    assert.equal(response.json.message, 'Request body too large');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket upgrade succeeds without cookies and emits state.ready', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);

  try {
    const { socket, ready } = await connectWebSocket(port);
    assert.equal(ready.type, 'state.ready');
    assert.ok(Array.isArray(ready.snapshot ? (ready.snapshot as { networks: unknown[] }).networks : []));
    await closeWebSocket(socket);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
