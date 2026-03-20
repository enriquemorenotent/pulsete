import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewaySocketCallbacks } from '../web/src/useAppLifecycle.js';
import type { SocketHandle } from '../web/src/client.js';

const createSocket = (): SocketHandle => ({
  send() {},
  close() {},
});

const emptySnapshot = {
  networks: [],
  friends: [],
  friendPresence: {},
  buffers: [],
  channels: [],
  messages: [],
  networkStates: {},
};

test('createGatewaySocketCallbacks ignores stale socket events', () => {
  const currentSocket = createSocket();
  const staleSocket = createSocket();
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];
  let generationUpdates = 0;
  const reconnectAttemptRef = { current: 2 };

  const callbacks = createGatewaySocketCallbacks({
    getSocket: () => staleSocket,
    socketRef: { current: currentSocket },
    isClosedByClient: () => false,
    dispatch: (action) => {
      dispatched.push(action);
    },
    reconnectAttemptRef,
    reconnectTimerRef: { current: null },
    setSocketGeneration: () => {
      generationUpdates += 1;
    },
  });

  callbacks.onOpen();
  callbacks.onMessage({ type: 'state.ready', snapshot: emptySnapshot });
  callbacks.onClose();

  assert.deepEqual(dispatched, []);
  assert.equal(reconnectAttemptRef.current, 2);
  assert.equal(generationUpdates, 0);
});

test('createGatewaySocketCallbacks handles state.ready only for the current socket', () => {
  const currentSocket = createSocket();
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];
  const reconnectAttemptRef = { current: 3 };

  const callbacks = createGatewaySocketCallbacks({
    getSocket: () => currentSocket,
    socketRef: { current: currentSocket },
    isClosedByClient: () => false,
    dispatch: (action) => {
      dispatched.push(action);
    },
    reconnectAttemptRef,
    reconnectTimerRef: { current: null },
    setSocketGeneration: () => {},
  });

  callbacks.onMessage({ type: 'state.ready', snapshot: emptySnapshot });

  assert.equal(reconnectAttemptRef.current, 0);
  assert.deepEqual(dispatched, [
    { type: 'gateway-connected' },
    { type: 'snapshot', snapshot: emptySnapshot },
  ]);
});
