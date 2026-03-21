import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol.js';
import {
  bindStickyScrollTracking,
  createGatewaySocketCallbacks,
  isScrollNearBottom,
  loadSelectedBufferHistory,
  scrollNodeToBottom,
} from '../web/src/useAppLifecycle.js';
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
  pendingChannels: [],
  messages: [],
  networkStates: {},
};

const message: ChatMessage = {
  id: 'message-1',
  networkId: 'network-1',
  target: '#help',
  nick: 'alice',
  body: 'hello',
  kind: 'line' as const,
  self: false,
  ts: 1,
};

type HistoryPayload = { messages: ChatMessage[] };

type ScrollListener = () => void;

const createScrollNode = (overrides: Partial<{
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  firstElementChild: Element | null;
}> = {}) => {
  let scrollListener: ScrollListener | null = null;
  return {
    node: {
      clientHeight: overrides.clientHeight ?? 120,
      scrollHeight: overrides.scrollHeight ?? 420,
      scrollTop: overrides.scrollTop ?? 0,
      firstElementChild: overrides.firstElementChild ?? ({} as Element),
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'scroll' && typeof listener === 'function') {
          scrollListener = listener as ScrollListener;
        }
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'scroll' && listener === scrollListener) {
          scrollListener = null;
        }
      },
    },
    emitScroll() {
      scrollListener?.();
    },
  };
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
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => ({ messages: [message] }),
    isCurrentRequest: () => true,
  });

  assert.deepEqual(dispatched, [
    { type: 'set-history-loading', value: true },
    { type: 'append-messages', messages: [message] },
    { type: 'set-history-loading', value: false },
  ]);
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
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => pendingHistory,
    isCurrentRequest: () => current,
  });

  current = false;
  resolveHistory({ messages: [message] });
  await loading;

  assert.deepEqual(dispatched, [{ type: 'set-history-loading', value: true }]);
});

test('loadSelectedBufferHistory reports failures only for the current request', async () => {
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];

  await loadSelectedBufferHistory({
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => {
      throw new Error('boom');
    },
    isCurrentRequest: () => true,
  });

  assert.deepEqual(dispatched, [
    { type: 'set-history-loading', value: true },
    { type: 'set-history-loading', value: false },
    { type: 'set-banner', banner: { kind: 'error', message: 'Failed to load history' } },
  ]);
});

test('scroll helpers detect bottom anchoring and scroll to the end', () => {
  const { node } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 278 });

  assert.equal(isScrollNearBottom(node), true);
  scrollNodeToBottom(node);
  assert.equal(node.scrollTop, 400);
});

test('sticky scroll tracking keeps the view pinned when content grows at the bottom', () => {
  const { node } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
  const stickToBottomRef = { current: true };
  let resizeCallback: (() => void) | null = null;
  let disconnected = false;

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: (callback) => {
      resizeCallback = callback;
      return {
        observe() {},
        disconnect() {
          disconnected = true;
        },
      };
    },
  });

  node.scrollHeight = 560;
  const runResize = resizeCallback ?? (() => {
    throw new Error('Missing resize callback');
  });
  runResize();

  assert.equal(node.scrollTop, 560);
  assert.equal(stickToBottomRef.current, true);

  cleanup();
  assert.equal(disconnected, true);
});

test('sticky scroll tracking stops forcing the bottom after the user scrolls up', () => {
  const { node, emitScroll } = createScrollNode({ clientHeight: 100, scrollHeight: 400, scrollTop: 400 });
  const stickToBottomRef = { current: true };
  let resizeCallback: (() => void) | null = null;

  const cleanup = bindStickyScrollTracking({
    node,
    stickToBottomRef,
    createResizeObserver: (callback) => {
      resizeCallback = callback;
      return {
        observe() {},
        disconnect() {},
      };
    },
  });

  node.scrollTop = 180;
  emitScroll();
  node.scrollHeight = 560;
  const runResize = resizeCallback ?? (() => {
    throw new Error('Missing resize callback');
  });
  runResize();

  assert.equal(stickToBottomRef.current, false);
  assert.equal(node.scrollTop, 180);

  cleanup();
});
