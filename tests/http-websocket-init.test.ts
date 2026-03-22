import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { initializeWebSocketConnection } from '../server/ws-server.js';
import { createFailingWebSocket, createThrowingWebSocket } from './helpers/http-websocket-test-helpers.js';

type WebSocketTestContext = Parameters<typeof initializeWebSocketConnection>[1];
type WebSocketTestContextOverrides = Partial<WebSocketTestContext>;

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

  assert.equal(initializeWebSocketConnection(socket as unknown as WebSocket, context), true);
  assert.deepEqual(calls, ['attach', 'snapshot', 'connect:net-1']);
});
