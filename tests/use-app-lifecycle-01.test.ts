import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol-chat.js';
import type { SocketHandle } from '../web/src/client.js';
import {
  createGatewaySocketCallbacks,
} from '../web/src/useGatewayConnection.js';
import {
  loadOlderBufferHistory,
  loadSelectedBufferHistory,
} from '../web/src/transcript/history.js';

const createSocket = (): SocketHandle => ({
  send() {},
  close() {},
});

const emptySnapshot = {
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
};

const message: ChatMessage = {
  id: 'message-1',
  bufferId: 'buffer-1',
  networkId: 'network-1',
  target: '#help',
  nick: 'alice',
  body: 'hello',
  kind: 'line' as const,
  self: false,
  ts: 1,
};

type HistoryPayload = { messages: ChatMessage[]; hasMore: boolean };

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

test('createGatewaySocketCallbacks forwards pending channel events from the current socket', () => {
  const currentSocket = createSocket();
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];

  const callbacks = createGatewaySocketCallbacks({
    getSocket: () => currentSocket,
    socketRef: { current: currentSocket },
    isClosedByClient: () => false,
    dispatch: (action) => {
      dispatched.push(action);
    },
    reconnectAttemptRef: { current: 0 },
    reconnectTimerRef: { current: null },
    setSocketGeneration: () => {},
  });

  callbacks.onMessage({
    type: 'channel.pending',
    pendingChannel: { networkId: 'network-1', channel: '#help' },
  });
  callbacks.onMessage({
    type: 'channel.pending.remove',
    networkId: 'network-1',
    channel: '#help',
  });

  assert.deepEqual(dispatched, [
    {
      type: 'add-pending-channel',
      pendingChannel: { networkId: 'network-1', channel: '#help' },
    },
    {
      type: 'remove-pending-channel',
      networkId: 'network-1',
      channel: '#help',
    },
  ]);
});

test('loadSelectedBufferHistory appends messages for the current request', async () => {
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];

  await loadSelectedBufferHistory({
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    hasLoadedHistory: false,
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => ({ messages: [message], hasMore: true }),
    isCurrentRequest: () => true,
  });

  assert.deepEqual(dispatched, [
    { type: 'append-messages', messages: [message] },
    { type: 'history-buffer-loaded', bufferId: 'buffer-1', hasOlder: true },
  ]);
});

test('loadSelectedBufferHistory skips buffers that already loaded history', async () => {
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];

  await loadSelectedBufferHistory({
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    hasLoadedHistory: true,
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => ({ messages: [message], hasMore: false }),
    isCurrentRequest: () => true,
  });

  assert.deepEqual(dispatched, []);
});

test('loadSelectedBufferHistory ignores stale completions', async () => {
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];
  let resolveHistory!: (value: HistoryPayload) => void;
  const pendingHistory = new Promise<HistoryPayload>((resolve) => {
    resolveHistory = resolve;
  });
  let current = true;

  const loading = loadSelectedBufferHistory({
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    hasLoadedHistory: false,
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => pendingHistory,
    isCurrentRequest: () => current,
  });

  current = false;
  resolveHistory({ messages: [message], hasMore: false });
  await loading;

  assert.deepEqual(dispatched, []);
});

test('loadSelectedBufferHistory reports failures only for the current request', async () => {
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];

  await loadSelectedBufferHistory({
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    hasLoadedHistory: false,
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => {
      throw new Error('boom');
    },
    isCurrentRequest: () => true,
  });

  assert.deepEqual(dispatched, [
    { type: 'set-banner', banner: { kind: 'error', message: 'Failed to load history' } },
  ]);
});

test('loadOlderBufferHistory prepends older messages and updates hasOlder state', async () => {
  const olderMessage = { ...message, id: 'message-0', ts: 0 };
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];

  const prependedCount = await loadOlderBufferHistory({
    beforeMessageId: message.id,
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => ({ messages: [olderMessage], hasMore: false }),
  });

  assert.equal(prependedCount, 1);
  assert.deepEqual(dispatched, [
    { type: 'prepend-messages', messages: [olderMessage] },
    { type: 'history-buffer-loaded', bufferId: 'buffer-1', hasOlder: false },
  ]);
});
