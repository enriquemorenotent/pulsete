import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Runtime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import type { ServerMessage } from '../shared/protocol.js';
import { createNetworkInput,waitFor } from './helpers/runtime-test-common.js';
import { createStreamingListServer } from './helpers/runtime-test-list-servers.js';
import { createSocketRecorder } from './helpers/runtime-test-sockets.js';

test('runtime replays active LIST entries to a later requester without sending LIST twice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
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

    const requestId = runtime.sessions.requestChannelList(network.id, firstSocket);
    await waitFor(() =>
      firstSocket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    const replayedRequestId = runtime.sessions.requestChannelList(network.id, secondSocket);
    assert.equal(replayedRequestId, requestId);
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.equal(received.filter((line) => line === 'LIST').length, 1);
    assert.equal(
      firstSocket.sent.filter(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      ).length,
      1
    );
    assert.deepEqual(
      secondSocket.sent
        .filter((message): message is Extract<ServerMessage, { type: 'channel.list.entry' }> => message.type === 'channel.list.entry')
        .map((message) => message.entry),
      [
        { name: '#help', users: 42, topic: 'Support room' },
        { name: '#ops', users: 7, topic: 'Operators' },
      ]
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime does not replay active LIST entries twice to the same requester', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
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

    const repeatedRequestId = runtime.sessions.requestChannelList(network.id, socket);
    assert.equal(repeatedRequestId, requestId);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.equal(received.filter((line) => line === 'LIST').length, 1);
    assert.equal(
      socket.sent.filter(
        (message) =>
          message.type === 'channel.list.started'
          && message.requestId === requestId
      ).length,
      1
    );
    assert.equal(
      socket.sent.filter(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      ).length,
      1
    );
    assert.equal(
      socket.sent.filter(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#ops'
      ).length,
      1
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime replays active LIST entries after the same requester cancels and reopens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
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

    runtime.sessions.cancelChannelList(network.id, socket);
    socket.sent.length = 0;

    const reopenedRequestId = runtime.sessions.requestChannelList(network.id, socket);
    assert.equal(reopenedRequestId, requestId);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.equal(received.filter((line) => line === 'LIST').length, 1);
    assert.deepEqual(
      socket.sent.filter((message) => message.type.startsWith('channel.list')),
      [
        { type: 'channel.list.started', networkId: network.id, requestId },
        { type: 'channel.list.entry', networkId: network.id, requestId, entry: { name: '#help', users: 42, topic: 'Support room' } },
        { type: 'channel.list.entry', networkId: network.id, requestId, entry: { name: '#ops', users: 7, topic: 'Operators' } },
        { type: 'channel.list.completed', networkId: network.id, requestId },
      ]
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});
