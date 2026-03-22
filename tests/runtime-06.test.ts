import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Runtime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer,createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';
import { createListServer } from './helpers/runtime-test-list-servers.js';
import { createSocketRecorder } from './helpers/runtime-test-sockets.js';

test('runtime rejects oversized outbound lines without writing them to the socket', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const server = await createRegisteredServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => received.includes('NICK tester'));

    runtime.irc.sendMessage(network.id, 'helper', 'x'.repeat(600));
    runtime.irc.sendRaw(network.id, `NOTICE helper :${'y'.repeat(600)}`);

    await waitFor(
      () =>
        storage.listMessages(network.id, 'helper', 20)
          .filter((message) => message.body === 'IRC command exceeds the 510-byte limit')
          .length >= 1
        && storage.listMessages(network.id, 'server', 20)
          .filter((message) => message.body === 'IRC command exceeds the 510-byte limit')
          .length >= 1
    );

    assert.equal(received.some((line) => line.includes(`PRIVMSG helper :${'x'.repeat(600)}`)), false);
    assert.equal(received.some((line) => line.includes(`NOTICE helper :${'y'.repeat(600)}`)), false);
  } finally {
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime sendMessage does not persist unsent direct messages while disconnected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());

  runtime.irc.sendMessage(network.id, 'helper', 'hello');

  assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  assert.deepEqual(
    storage.listMessages(network.id, 'helper', 10).map((message) => ({
      target: message.target,
      kind: message.kind,
      body: message.body,
    })),
    [{ target: 'helper', kind: 'error', body: 'Not connected' }]
  );
  assert.deepEqual(storage.listMessages(network.id, 'server', 10), []);
});

test('runtime rejects client commands while the network is still connecting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    runtime.sessions.connect(network.id);
    runtime.irc.join(network.id, '#help');
    runtime.irc.sendMessage(network.id, 'helper', 'hello');
    runtime.irc.sendRaw(network.id, 'WHOIS helper');

    await waitFor(
      () =>
        received.includes('NICK tester')
        && received.includes('USER tester 0 * :Tester Example')
    );
    await waitFor(
      () =>
        storage.listMessages(network.id, 'server', 20)
          .filter((message) => message.body === 'Still connecting to server')
          .length >= 2
        && storage.listMessages(network.id, 'helper', 20)
          .some((message) => message.body === 'Still connecting to server')
    );

    assert.equal(received.includes('JOIN #help'), false);
    assert.equal(received.includes('PRIVMSG helper :hello'), false);
    assert.equal(received.includes('WHOIS helper'), false);
    assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'channel'), []);
    assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reports a failed channel-list request while disconnected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const socket = createSocketRecorder();

  runtime.gateway.attachSocket(socket);

  const requestId = runtime.sessions.requestChannelList(network.id, socket);

  assert.equal(typeof requestId, 'string');
  assert.deepEqual(socket.sent, [
    {
      type: 'channel.list.failed',
      networkId: network.id,
      requestId,
      message: 'Not connected',
    },
  ]);
});

test('runtime reports when a timed-out LIST is still draining late server replies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const socket = createSocketRecorder();

  runtime.gateway.attachSocket(socket);
  (runtime as unknown as {
    connections: Map<string, {
      requestChannelList(requestId: string): boolean;
      getChannelListRequestFailureMessage(): string;
    }>;
  }).connections.set(network.id, {
    requestChannelList() {
      return false;
    },
    getChannelListRequestFailureMessage() {
      return 'Waiting for the previous channel list response to finish';
    },
  });

  const requestId = runtime.sessions.requestChannelList(network.id, socket);

  assert.equal(typeof requestId, 'string');
  assert.deepEqual(socket.sent, [
    {
      type: 'channel.list.failed',
      networkId: network.id,
      requestId,
      message: 'Waiting for the previous channel list response to finish',
    },
  ]);
});

test('runtime removes channel-list subscribers after an immediate request failure', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createListServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const firstSocket = createSocketRecorder();
  const secondSocket = createSocketRecorder();

  try {
    runtime.gateway.attachSocket(firstSocket);
    runtime.gateway.attachSocket(secondSocket);

    const failedRequestId = runtime.sessions.requestChannelList(network.id, firstSocket);
    assert.deepEqual(firstSocket.sent, [
      {
        type: 'channel.list.failed',
        networkId: network.id,
        requestId: failedRequestId,
        message: 'Not connected',
      },
    ]);

    firstSocket.sent.length = 0;

    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.sessions.requestChannelList(network.id, secondSocket);
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.deepEqual(
      firstSocket.sent.filter((message) => message.type.startsWith('channel.list')),
      []
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});
