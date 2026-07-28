import assert from 'node:assert/strict';
import test from 'node:test';
import { api, connectSocket } from '../web/src/client.js';
import { gatewaySocketClosedMessage,getGatewayReconnectDelayMs } from '../web/src/gateway.js';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls = 0;
  private listeners: Record<string, Array<(event?: Event | MessageEvent) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: Event | MessageEvent) => void) {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event?: Event | MessageEvent) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener);
  }

  listenerCount(type: string) {
    return this.listeners[type]?.length ?? 0;
  }

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error('Socket is not open');
    }
    this.sent.push(data);
  }

  close() {
    const wasClosed = this.readyState === FakeWebSocket.CLOSED;
    this.closeCalls += 1;
    this.readyState = FakeWebSocket.CLOSED;
    if (!wasClosed) {
      this.emit('close', new Event('close'));
    }
  }

  emit(type: string, event?: Event | MessageEvent) {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

const installFakeWebSocket = () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  FakeWebSocket.instances = [];
  Object.assign(globalThis, {
    window: {
      location: { protocol: 'http:', host: 'example.test' },
    },
    WebSocket: FakeWebSocket,
  });
  return () => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: Window & typeof globalThis }).window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalWebSocket === undefined) {
      delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    } else {
      globalThis.WebSocket = originalWebSocket;
    }
  };
};

test('connectSocket forwards websocket events through the wrapper', () => {
  const restore = installFakeWebSocket();
  try {
    const messages: Array<{ type: string; networkId: string | null; message: string }> = [];
    const receivedTraffic: Array<{ characters: number; type: string }> = [];
    const sentTraffic: Array<{ characters: number; type: string }> = [];
    let instrumentedCloseCalls = 0;
    let instrumentedCreateCalls = 0;
    let instrumentedOpenCalls = 0;
    let openCalls = 0;
    let closeCalls = 0;

    const handle = connectSocket(
      {
        onMessage: (message) => {
          if (message.type === 'notice') {
            messages.push(message);
          }
        },
        onOpen: () => {
          openCalls += 1;
        },
        onClose: () => {
          closeCalls += 1;
        },
      },
      {
        onClose: () => {
          instrumentedCloseCalls += 1;
        },
        onCreate: () => {
          instrumentedCreateCalls += 1;
        },
        onOpen: () => {
          instrumentedOpenCalls += 1;
        },
        onReceive: (type, characters) => {
          receivedTraffic.push({ type, characters });
        },
        onSend: (type, characters) => {
          sentTraffic.push({ type, characters });
        },
      },
    );

    const socket = FakeWebSocket.instances[0]!;
    assert.equal(socket.url, 'ws://example.test/ws');

    socket.readyState = FakeWebSocket.OPEN;
    socket.emit('open', new Event('open'));
    handle.send({ type: 'network.connect', networkId: 'net-1' });
    socket.emit('message', {
      data: JSON.stringify({ type: 'notice', networkId: null, message: 'hello' }),
    } as MessageEvent);
    handle.close();

    assert.equal(openCalls, 1);
    assert.equal(closeCalls, 1);
    assert.equal(instrumentedOpenCalls, 1);
    assert.equal(instrumentedCreateCalls, 1);
    assert.equal(instrumentedCloseCalls, 1);
    assert.equal(socket.listenerCount('open'), 0);
    assert.equal(socket.listenerCount('message'), 0);
    assert.equal(socket.listenerCount('close'), 0);
    assert.deepEqual(socket.sent.map((entry) => JSON.parse(entry)), [{ type: 'network.connect', networkId: 'net-1' }]);
    assert.deepEqual(messages, [{ type: 'notice', networkId: null, message: 'hello' }]);
    assert.deepEqual(sentTraffic, [{
      type: 'network.connect',
      characters: socket.sent[0]!.length,
    }]);
    assert.deepEqual(receivedTraffic, [{
      type: 'notice',
      characters: JSON.stringify({ type: 'notice', networkId: null, message: 'hello' }).length,
    }]);
  } finally {
    restore();
  }
});

test('connectSocket throws a stable error and retires the socket when send is attempted before open', () => {
  const restore = installFakeWebSocket();
  try {
    let closeCalls = 0;
    const handle = connectSocket({
      onMessage: () => {},
      onClose: () => {
        closeCalls += 1;
      },
    });

    const socket = FakeWebSocket.instances[0]!;

    assert.throws(() => handle.send({ type: 'network.connect', networkId: 'net-1' }), /Gateway socket is not open/);
    assert.equal(socket.closeCalls, 1);
    assert.equal(closeCalls, 1);
    assert.equal(socket.readyState, FakeWebSocket.CLOSED);
    assert.equal(socket.listenerCount('open'), 0);
    assert.equal(socket.listenerCount('message'), 0);
    assert.equal(socket.listenerCount('close'), 0);
  } finally {
    restore();
  }
});

test('connectSocket closes the socket when the server payload cannot be decoded', () => {
  const restore = installFakeWebSocket();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    let closeCalls = 0;
    let messageCalls = 0;
    connectSocket({
      onMessage: () => {
        messageCalls += 1;
      },
      onClose: () => {
        closeCalls += 1;
      },
    });

    const socket = FakeWebSocket.instances[0]!;
    socket.readyState = FakeWebSocket.OPEN;
    socket.emit('open', new Event('open'));
    socket.emit('message', { data: '{not-json' } as MessageEvent);

    assert.equal(messageCalls, 0);
    assert.equal(socket.closeCalls, 1);
    assert.equal(closeCalls, 1);
    assert.equal(socket.readyState, FakeWebSocket.CLOSED);
    assert.equal(socket.listenerCount('open'), 0);
    assert.equal(socket.listenerCount('message'), 0);
    assert.equal(socket.listenerCount('close'), 0);
  } finally {
    console.error = originalConsoleError;
    restore();
  }
});

test('gateway reconnect backoff caps after the second retry', () => {
  assert.equal(getGatewayReconnectDelayMs(0), 1_000);
  assert.equal(getGatewayReconnectDelayMs(1), 2_000);
  assert.equal(getGatewayReconnectDelayMs(2), 5_000);
  assert.equal(getGatewayReconnectDelayMs(5), 5_000);
  assert.equal(gatewaySocketClosedMessage, 'Gateway socket is not open');
});

test('searchBufferHistory calls the buffer-scoped history search endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push(String(input));
    receivedSignal = init?.signal;
    return new Response(JSON.stringify({
      query: 'needle',
      results: [],
      hasMore: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const payload = await api.searchBufferHistory('buffer-1', 'needle', 7, {
      signal: controller.signal,
    });

    assert.deepEqual(fetchCalls, ['/api/buffers/buffer-1/history/search?q=needle&limit=7']);
    assert.equal(receivedSignal, controller.signal);
    assert.deepEqual(payload, { query: 'needle', results: [], hasMore: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchLogs calls the global log search endpoint with filters', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push(String(input));
    receivedSignal = init?.signal;
    return new Response(JSON.stringify({
      query: 'needle',
      networkId: 'network-1',
      target: '#help',
      results: [],
      hasMore: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const payload = await api.searchLogs('needle', {
      networkId: 'network-1',
      target: '#help',
    }, 7, {
      signal: controller.signal,
    });

    assert.deepEqual(fetchCalls, ['/api/logs/search?q=needle&limit=7&networkId=network-1&target=%23help']);
    assert.equal(receivedSignal, controller.signal);
    assert.deepEqual(payload, {
      query: 'needle',
      networkId: 'network-1',
      target: '#help',
      results: [],
      hasMore: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listLogSources calls the source listing endpoint with filters', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: string[] = [];
  const controller = new AbortController();
  let receivedSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push(String(input));
    receivedSignal = init?.signal;
    return new Response(JSON.stringify({
      kind: 'query',
      networkId: 'network-1',
      q: 'missd',
      sources: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const payload = await api.listLogSources({
      kind: 'query',
      networkId: 'network-1',
      q: 'missd',
    }, 7, {
      signal: controller.signal,
    });

    assert.deepEqual(fetchCalls, ['/api/logs/sources?limit=7&q=missd&networkId=network-1&kind=query']);
    assert.equal(receivedSignal, controller.signal);
    assert.deepEqual(payload, {
      kind: 'query',
      networkId: 'network-1',
      q: 'missd',
      sources: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clearBufferHistory calls the buffer-scoped history delete endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ body: string; method: string; url: string }> = [];
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      body: String(init?.body ?? ''),
      method: String(init?.method ?? 'GET'),
      url: String(input),
    });
    return new Response(JSON.stringify({
      ok: true,
      buffer: {
        id: 'buffer-1', networkId: 'network-1', kind: 'query', target: 'Sofia',
        unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null,
      },
      messages: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const payload = await api.clearBufferHistory('buffer-1');

    assert.deepEqual(fetchCalls, [
      { url: '/api/buffers/buffer-1/history', method: 'DELETE', body: '{}' },
    ]);
    assert.equal(payload.ok, true);
    assert.equal(payload.buffer.kind, 'query');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveBufferNotes updates the buffer notes endpoint', async () => {
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; method: string; notes: string }> = [];
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ url: String(input), method: String(init?.method ?? 'GET'), notes: JSON.parse(String(init?.body ?? '{}')).notes });
    return new Response(JSON.stringify({
      buffer: {
        id: 'buffer-1', networkId: 'network-1', kind: 'query', target: 'Sofia',
        notes: 'Ask about the bridge watch',
        unread: 0, priorityUnread: 0, lastReadTs: null, lastReadMessageId: null,
      },
      messages: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const payload = await api.saveBufferNotes('buffer-1', 'Ask about the bridge watch');
    assert.deepEqual(fetchCalls, [{ url: '/api/buffers/buffer-1/notes', method: 'PUT', notes: 'Ask about the bridge watch' }]);
    assert.equal(payload.buffer.notes, 'Ask about the bridge watch');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolvePagePreview posts the webpage URL and forwards cancellation', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    body: unknown;
    method: string;
    signal: AbortSignal | null | undefined;
    url: string;
  }> = [];
  const controller = new AbortController();
  globalThis.fetch = (async (input, init) => {
    calls.push({
      body: JSON.parse(String(init?.body ?? '{}')),
      method: String(init?.method ?? 'GET'),
      signal: init?.signal,
      url: String(input),
    });
    return new Response(JSON.stringify({
      preview: {
        imageUrl: 'https://cdn.example/card.png',
        pageUrl: 'https://example.com/post',
        title: 'Example card',
      },
      unavailableReason: null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const payload = await api.resolvePagePreview(
      'https://example.com/post',
      { signal: controller.signal },
    );

    assert.deepEqual(calls, [{
      body: { url: 'https://example.com/post' },
      method: 'POST',
      signal: controller.signal,
      url: '/api/media/page-preview',
    }]);
    assert.equal(payload.preview?.title, 'Example card');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
