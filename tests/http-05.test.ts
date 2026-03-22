import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
import { listen,requestJson,sendRawRequest } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,createFailingWebSocket,createThrowingWebSocket } from './helpers/http-websocket-test-helpers.js';

type WebSocketTestContext = Parameters<typeof initializeWebSocketConnection>[1];
type WebSocketTestContextOverrides = {
  [K in keyof WebSocketTestContext]?: Partial<WebSocketTestContext[K]>;
};

const createEmptySnapshot = () => ({
  networks: [],
  friends: [],
  friendPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: [],
  networkStates: {},
});

const createWebSocketTestContext = (overrides: WebSocketTestContextOverrides = {}): WebSocketTestContext => ({
  networkCatalog: { list() { return []; } },
  gateway: {
    attachSocket() {},
    detachSocket() {},
    snapshot: createEmptySnapshot,
    ...overrides.gateway,
  },
  sessions: {
    connect() {},
    disconnect() {},
    requestChannelList() {
      return 'request-1';
    },
    cancelChannelList() {},
    ...overrides.sessions,
  },
  conversations: {
    openQuery() {
      throw new Error('not used');
    },
    closeBuffer() {
      throw new Error('not used');
    },
    markBufferRead() {
      throw new Error('not used');
    },
    history() {
      return [];
    },
    ...overrides.conversations,
  },
  friends: {
    upsertFriend() {
      throw new Error('not used');
    },
    removeFriend() {
      throw new Error('not used');
    },
    ...overrides.friends,
  },
  irc: {
    join() {
      throw new Error('not used');
    },
    part() {
      throw new Error('not used');
    },
    sendMessage() {
      throw new Error('not used');
    },
    sendRaw() {
      throw new Error('not used');
    },
    ...overrides.irc,
  },
  networks: {
    saveNetwork() {
      throw new Error('not used');
    },
    duplicateNetwork() {
      throw new Error('not used');
    },
    deleteNetwork() {
      throw new Error('not used');
    },
    ...overrides.networks,
  },
});

test('malformed request targets and route params return handled bad requests', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  storage.upsertNetwork(createNetworkInput());
  const server = createServer(createHttpHandler(new Runtime(storage.runtimeStore).context));
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
  const runtime = new Runtime(storage.runtimeStore);
  const server = createServer(createHttpHandler(runtime.context));
  attachWebSocketServer(server, runtime.context);
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
  const server = createServer(createHttpHandler(new Runtime(storage.runtimeStore).context));
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
  const runtime = new Runtime(storage.runtimeStore);
  const server = createServer(createHttpHandler(runtime.context));
  attachWebSocketServer(server, runtime.context);
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

test('websocket initialization installs the error handler before the first snapshot send', () => {
  const { socket, getErrorListenersAtSend } = createThrowingWebSocket();
  let attached = false;
  const context = createWebSocketTestContext({
    gateway: {
      attachSocket() {
        attached = true;
      },
      snapshot: createEmptySnapshot,
    },
  });

  assert.doesNotThrow(() => {
    initializeWebSocketConnection(socket as WebSocket, context);
  });
  assert.equal(attached, true);
  assert.equal(getErrorListenersAtSend() > 0, true);
});

test('websocket initialization detaches the socket when the first snapshot send fails', () => {
  const { socket, getCloseCalls } = createFailingWebSocket();
  const calls: string[] = [];
  const context = createWebSocketTestContext({
    gateway: {
      attachSocket() {
        calls.push('attach');
      },
      detachSocket() {
        calls.push('detach');
      },
      snapshot: createEmptySnapshot,
    },
  });

  assert.equal(initializeWebSocketConnection(socket, context), false);
  assert.deepEqual(calls, ['attach', 'detach']);
  assert.equal(getCloseCalls(), 1);
});

test('websocket initialization handles frames emitted during the first snapshot send', () => {
  const calls: string[] = [];
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    send(payload: string): boolean;
    close(): void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.send = (_payload: string) => {
    socket.emit('message', JSON.stringify({ type: 'network.connect', networkId: 'net-1' }));
    return true;
  };
  socket.close = () => {};
  const context = createWebSocketTestContext({
    gateway: {
      attachSocket() {
        calls.push('attach');
      },
      snapshot() {
        calls.push('snapshot');
        return createEmptySnapshot();
      },
    },
    sessions: {
      connect(networkId: string) {
        calls.push(`connect:${networkId}`);
      },
    },
  });

  assert.equal(initializeWebSocketConnection(socket as unknown as WebSocket, context), true);
  assert.deepEqual(calls, ['attach', 'snapshot', 'connect:net-1']);
});
