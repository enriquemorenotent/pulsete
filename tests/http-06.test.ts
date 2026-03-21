import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { createHttpHandler } from '../server/http-router.js';
import { Runtime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer,initializeWebSocketConnection } from '../server/ws-server.js';
import { listen } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,createBootstrapThenFailingWebSocket,waitForWebSocketMessage,waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('websocket error replies detach the socket when a later send fails', () => {
  const { socket, getCloseCalls } = createBootstrapThenFailingWebSocket();
  const calls: string[] = [];
  const context = {
    runtime: {
      attachSocket() {
        calls.push('attach');
      },
      detachSocket() {
        calls.push('detach');
      },
      snapshot() {
        return {
          networks: [],
          friends: [],
          friendPresence: {},
          buffers: [],
          channels: [],
          messages: [],
          networkStates: {},
        };
      },
    },
  } as unknown as Parameters<typeof initializeWebSocketConnection>[1];

  assert.equal(initializeWebSocketConnection(socket, context), true);
  socket.emit('message', '{invalid-json');

  assert.deepEqual(calls, ['attach', 'detach']);
  assert.equal(getCloseCalls(), 1);
});

test('websocket commands use the live local state and forward runtime methods', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'helper');
  const runtime = new Runtime(storage);
  const calls: string[] = [];
  runtime.connect = ((networkId: string) => {
    calls.push(`connect:${networkId}`);
  }) as Runtime['connect'];
  runtime.disconnect = ((networkId: string) => {
    calls.push(`disconnect:${networkId}`);
  }) as Runtime['disconnect'];
  runtime.openQuery = ((networkId: string, target: string) => {
    calls.push(`query.open:${networkId}:${target}`);
    return query;
  }) as Runtime['openQuery'];
  runtime.requestChannelList = ((networkId: string) => {
    calls.push(`channel.list.request:${networkId}`);
    runtime.send({ type: 'channel.list.started', networkId, requestId: 'request-1' });
    return 'request-1';
  }) as Runtime['requestChannelList'];
  runtime.cancelChannelList = ((networkId: string) => {
    calls.push(`channel.list.cancel:${networkId}`);
  }) as Runtime['cancelChannelList'];
  runtime.sendRaw = ((networkId: string, raw: string, sourceBufferId?: string) => {
    calls.push(`raw.send:${networkId}:${raw}:${sourceBufferId ?? ''}`);
  }) as Runtime['sendRaw'];

  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket, ready } = await connectWebSocket(port);

  try {
    assert.equal((ready.snapshot as { networks: Array<{ id: string }> }).networks.some((entry) => entry.id === network.id), true);

    const queryOpenPromise = waitForWebSocketMessageType(socket, 'buffer.upsert');
    const channelListPromise = waitForWebSocketMessageType(socket, 'channel.list.started');
    socket.send(JSON.stringify({ type: 'network.connect', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'network.disconnect', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'helper' }));
    socket.send(JSON.stringify({ type: 'channel.list.request', networkId: network.id }));
    socket.send(JSON.stringify({ type: 'channel.list.cancel', networkId: network.id }));
    socket.send(JSON.stringify({
      type: 'raw.send',
      networkId: network.id,
      raw: '/quote WHOIS alice',
      sourceBufferId: query.id,
    }));

    assert.deepEqual(await queryOpenPromise, {
      type: 'buffer.upsert',
      buffer: query,
    });
    assert.deepEqual(await channelListPromise, {
      type: 'channel.list.started',
      networkId: network.id,
      requestId: 'request-1',
    });
    assert.deepEqual(calls, [
      `connect:${network.id}`,
      `disconnect:${network.id}`,
      `query.open:${network.id}:helper`,
      `channel.list.request:${network.id}`,
      `channel.list.cancel:${network.id}`,
      `raw.send:${network.id}:/quote WHOIS alice:${query.id}`,
    ]);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket query.open uses the live runtime path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const queryOpenPromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === 'helper',
      'live query.open buffer'
    );
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'helper' }));
    const opened = await queryOpenPromise as { buffer: { id: string; target: string; kind: string } };
    assert.equal(opened.buffer.target, 'helper');
    assert.equal(opened.buffer.kind, 'query');
    assert.equal(storage.getBuffer(opened.buffer.id)?.target, 'helper');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket channel.list.cancel ignores missing networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const server = createServer(createHttpHandler({ storage, runtime }));
  attachWebSocketServer(server, { storage, runtime });
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);
  const messages: Array<Record<string, unknown>> = [];
  const handleMessage = (payload: WebSocket.RawData) => {
    messages.push(JSON.parse(payload.toString()) as Record<string, unknown>);
  };

  socket.on('message', handleMessage);

  try {
    socket.send(JSON.stringify({ type: 'channel.list.cancel', networkId: 'missing-network' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.deepEqual(messages.filter((message) => message.type === 'error'), []);
    assert.equal(socket.readyState, WebSocket.OPEN);
  } finally {
    socket.off('message', handleMessage);
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
