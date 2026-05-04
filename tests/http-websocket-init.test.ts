import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import WebSocket from 'ws';
import { attachWebSocketServer, initializeWebSocketConnection } from '../server/ws-server.js';
import { createFailingWebSocket, createThrowingWebSocket } from './helpers/http-websocket-test-helpers.js';
import { createWebSocketTestDouble } from './helpers/websocket-test-doubles.js';

type WebSocketTestContext = Parameters<typeof initializeWebSocketConnection>[1];
type WebSocketTestContextOverrides = Partial<WebSocketTestContext>;

const createEmptySnapshot = () => ({
  networks: [],
  friends: [],
  nickEmojis: [],
  mutedNicks: [],
  friendPresence: {},
  queryPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: [],
  networkStates: {},
});

const createWebSocketTestContext = (overrides: WebSocketTestContextOverrides = {}): WebSocketTestContext => ({
  attachSocket() {},
  detachSocket() {},
  snapshot: createEmptySnapshot,
  handleMessage() {},
  ...overrides,
});

test('websocket initialization installs the error handler before the first snapshot send', () => {
  const { socket, getErrorListenersAtSend } = createThrowingWebSocket();
  let attached = false;
  const context = createWebSocketTestContext({
    attachSocket() {
      attached = true;
    },
    snapshot: createEmptySnapshot,
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
    attachSocket() {
      calls.push('attach');
    },
    detachSocket() {
      calls.push('detach');
    },
    snapshot: createEmptySnapshot,
  });

  assert.equal(initializeWebSocketConnection(socket, context), false);
  assert.deepEqual(calls, ['attach', 'detach']);
  assert.equal(getCloseCalls(), 1);
  assert.equal(socket.listenerCount('message'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(socket.listenerCount('close'), 0);
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
    attachSocket() {
      calls.push('attach');
    },
    snapshot() {
      calls.push('snapshot');
      return createEmptySnapshot();
    },
    handleMessage(_socket, message) {
      if (message.type === 'network.connect') {
        calls.push(`connect:${message.networkId}`);
      }
    },
  });

  assert.equal(initializeWebSocketConnection(createWebSocketTestDouble(socket), context), true);
  assert.deepEqual(calls, ['attach', 'snapshot', 'connect:net-1']);
});

test('websocket initialization detaches listeners when the initial snapshot throws', () => {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    send(payload: string): boolean;
    close(code?: number, reason?: string): void;
  };
  const calls: string[] = [];
  socket.readyState = WebSocket.OPEN;
  socket.send = () => {
    calls.push('send');
    return true;
  };
  socket.close = (code?: number, reason?: string) => {
    calls.push(`close:${code}:${reason}`);
    socket.readyState = WebSocket.CLOSED;
    socket.emit('close');
  };
  const context = createWebSocketTestContext({
    attachSocket() {
      calls.push('attach');
    },
    detachSocket() {
      calls.push('detach');
    },
    snapshot() {
      calls.push('snapshot');
      throw new Error('snapshot failed');
    },
  });

  assert.equal(initializeWebSocketConnection(createWebSocketTestDouble(socket), context), false);
  assert.deepEqual(calls, [
    'attach',
    'snapshot',
    'detach',
    'close:1011:WebSocket initialization failed',
  ]);
  assert.equal(socket.listenerCount('message'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(socket.listenerCount('close'), 0);
});

test('websocket initialization removes runtime listeners after socket close', () => {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    send(payload: string): boolean;
    close(): void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.send = () => true;
  socket.close = () => {
    socket.emit('close');
  };
  const context = createWebSocketTestContext();

  assert.equal(initializeWebSocketConnection(createWebSocketTestDouble(socket), context), true);
  assert.equal(socket.listenerCount('message'), 1);
  assert.equal(socket.listenerCount('error'), 1);
  assert.equal(socket.listenerCount('close'), 1);

  socket.emit('close');

  assert.equal(socket.listenerCount('message'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(socket.listenerCount('close'), 0);
});

test('attached websocket server releases upgrade listener on http server close', () => {
  const server = createServer();
  const context = createWebSocketTestContext();

  attachWebSocketServer(server, context);
  assert.equal(server.listenerCount('upgrade'), 1);
  assert.equal(server.listenerCount('close'), 1);

  server.emit('close');

  assert.equal(server.listenerCount('upgrade'), 0);
  assert.equal(server.listenerCount('close'), 0);
});
