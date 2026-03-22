import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { Runtime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,waitFor } from './helpers/runtime-test-common.js';
import { createListServer,createStreamingListServer } from './helpers/runtime-test-list-servers.js';
import { createSocketRecorder,createThrowingSocket } from './helpers/runtime-test-sockets.js';

test('runtime drops channel-list events after the requester disconnects mid-LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const requesterSocket = createSocketRecorder();
  const observerSocket = createSocketRecorder();

  try {
    runtime.gateway.attachSocket(requesterSocket);
    runtime.gateway.attachSocket(observerSocket);
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.sessions.requestChannelList(network.id, requesterSocket);
    await waitFor(() =>
      requesterSocket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    requesterSocket.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.deepEqual(
      observerSocket.sent.filter((message) => message.type.startsWith('channel.list')),
      []
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reports a failed channel-list request when the network disconnects mid-LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.gateway.attachSocket(socket);
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.sessions.requestChannelList(network.id, socket);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    listServer.closeConnections();

    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.failed'
          && message.requestId === requestId
          && message.message === 'Channel list request was interrupted'
      )
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reports a failed channel-list request when disconnect is requested mid-LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.gateway.attachSocket(socket);
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.sessions.requestChannelList(network.id, socket);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    runtime.sessions.disconnect(network.id);

    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.failed'
          && message.requestId === requestId
          && message.message === 'Channel list request was interrupted'
      )
    );
  } finally {
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime removes channel-list subscribers after a request completes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
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
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    const firstRequestId = runtime.sessions.requestChannelList(network.id, firstSocket);
    await waitFor(() =>
      firstSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === firstRequestId
      )
    );

    firstSocket.sent.length = 0;

    const secondRequestId = runtime.sessions.requestChannelList(network.id, secondSocket);
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === secondRequestId
      )
    );

    assert.notEqual(secondRequestId, firstRequestId);
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

test('runtime drops sockets whose websocket send throws without aborting the broadcast', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const healthySocket = createSocketRecorder();
  const throwingSocket = createThrowingSocket();

  runtime.gateway.attachSocket(healthySocket);
  runtime.gateway.attachSocket(throwingSocket as WebSocket);

  assert.doesNotThrow(() => {
    runtime.gateway.publish({ type: 'notice', networkId: null, message: 'hello' });
  });
  assert.deepEqual(healthySocket.sent, [{ type: 'notice', networkId: null, message: 'hello' }]);
  assert.equal(throwingSocket.closed, true);
});
