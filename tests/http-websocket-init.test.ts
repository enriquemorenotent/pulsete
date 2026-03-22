import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import WebSocket from 'ws';
import { initializeWebSocketConnection } from '../server/ws-server.js';
import { createFailingWebSocket, createThrowingWebSocket } from './helpers/http-websocket-test-helpers.js';

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
