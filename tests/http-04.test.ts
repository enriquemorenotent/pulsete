import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync,writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { serveStatic } from '../server/static-handler.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { waitFor } from './helpers/async-test-helpers.js';
import { listen,requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput,createRegisteredServer } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,waitForWebSocketMessage,waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('http buffer mutation routes succeed and broadcast buffer changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const ircReceived: string[] = [];
  const ircServer = await createRegisteredServer(ircReceived);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: ircServer.port,
  }));
  const server = createServer(createHttpHandler(runtime.context));
  attachWebSocketServer(server, runtime.context);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const queryMessagePromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === 'helper',
      'buffer.upsert helper'
    );
    const queryResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: 'helper' });
    assert.equal(queryResponse.status, 200);
    const queryBuffer = queryResponse.json.buffer as { id: string; kind: string; target: string };
    assert.equal(queryBuffer.kind, 'query');
    assert.equal(queryBuffer.target, 'helper');
    assert.equal(((await queryMessagePromise) as { buffer: { target: string } }).buffer.target, 'helper');

    runtime.sessions.connect(network.id);
    await waitFor(() => ircReceived.includes('NICK tester'));

    const channelPendingPromise = waitForWebSocketMessage(
      socket,
      (message) =>
        message.type === 'channel.pending'
        && (message.pendingChannel as { channel?: string } | undefined)?.channel === '#help',
      'channel.pending #help'
    );
    const channelResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/channels`, { channel: '#help' });
    assert.equal(channelResponse.status, 202);
    assert.equal(channelResponse.json.ok, true);
    assert.equal(((await channelPendingPromise) as { pendingChannel: { channel: string } }).pendingChannel.channel, '#help');

    const removeMessagePromise = waitForWebSocketMessageType(socket, 'buffer.remove');
    const deleteResponse = await requestJson(port, 'DELETE', `/api/buffers/${queryBuffer.id}`, {});
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await removeMessagePromise, {
      type: 'buffer.remove',
      networkId: network.id,
      bufferId: queryBuffer.id,
    });
  } finally {
    runtime.sessions.disconnect(network.id);
    await closeWebSocket(socket);
    ircServer.closeConnections();
    await new Promise<void>((resolve, reject) => ircServer.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('http connect and disconnect routes drive the IRC connection lifecycle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const ircReceived: string[] = [];
  const ircServer = await createRegisteredServer(ircReceived);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: ircServer.port,
  }));
  const server = createServer(createHttpHandler(runtime.context));
  attachWebSocketServer(server, runtime.context);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const connectedStatePromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'network.state' && message.networkId === network.id && message.phase === 'connected',
      'connected network.state'
    );
    const connectResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/connect`, {});
    assert.equal(connectResponse.status, 200);
    assert.equal(connectResponse.json.ok, true);
    await waitFor(() => ircReceived.includes('NICK tester'));
    await connectedStatePromise;

    const disconnectedStatePromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'network.state' && message.networkId === network.id && message.phase === 'offline',
      'disconnected network.state'
    );
    const disconnectResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/disconnect`, {});
    assert.equal(disconnectResponse.status, 200);
    assert.equal(disconnectResponse.json.ok, true);
    await waitFor(() => ircReceived.some((line) => line.startsWith('QUIT :Client disconnecting')));
    await disconnectedStatePromise;
  } finally {
    runtime.sessions.disconnect(network.id);
    await closeWebSocket(socket);
    ircServer.closeConnections();
    await new Promise<void>((resolve, reject) => ircServer.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('static handler returns a clear error when built assets are missing', async () => {
  const assetRoot = join(mkdtempSync(join(tmpdir(), 'pulsete-assets-')), 'missing-dist');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    void serveStatic(pathname, res, { assetRoot });
  });
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 503);
    assert.equal(await response.text(), 'Built assets not found. Run `npm run build` before starting the server.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('static handler serves built assets and spa fallback from the asset root', async () => {
  const assetRoot = join(mkdtempSync(join(tmpdir(), 'pulsete-assets-')), 'dist');
  mkdirSync(join(assetRoot, 'assets'), { recursive: true });
  writeFileSync(join(assetRoot, 'index.html'), '<!doctype html><html><body>pulsete</body></html>');
  writeFileSync(join(assetRoot, 'assets', 'app.js'), 'console.log("pulsete");');
  writeFileSync(join(assetRoot, 'assets', 'font.woff2'), 'font-data');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    void serveStatic(pathname, res, { assetRoot });
  });
  const port = await listen(server);

  try {
    const indexResponse = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(indexResponse.status, 200);
    assert.match(await indexResponse.text(), /pulsete/);

    const assetResponse = await fetch(`http://127.0.0.1:${port}/assets/app.js`);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get('content-type'), 'application/javascript; charset=utf-8');
    assert.match(await assetResponse.text(), /console\.log/);

    const fontResponse = await fetch(`http://127.0.0.1:${port}/assets/font.woff2`);
    assert.equal(fontResponse.status, 200);
    assert.equal(fontResponse.headers.get('content-type'), 'font/woff2');

    const fallbackResponse = await fetch(`http://127.0.0.1:${port}/workspace`);
    assert.equal(fallbackResponse.status, 200);
    assert.match(await fallbackResponse.text(), /pulsete/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('static handler does not expose repository files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).context));
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/package.json`);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'Not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connect route does not allow GET side effects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).context));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'GET', `/api/networks/${network.id}/connect`);
    assert.equal(response.status, 404);
    assert.equal(response.json.message, 'Not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
