import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { waitFor } from './helpers/async-test-helpers.js';
import { listen } from './helpers/http-request-helpers.js';
import { createNetworkInput,createRegisteredServer } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,waitForWebSocketCloseDetails,waitForWebSocketMessage,waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('websocket join, message, and part commands reach the live IRC connection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const ircReceived: string[] = [];
  const ircServer = await createRegisteredServer(ircReceived);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: ircServer.port,
  }));
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const instancePromise = waitForWebSocketMessage(
      socket,
      (message) =>
        message.type === 'network.upsert'
        && (message.network as { id?: string } | undefined)?.id === network.id,
      'network.upsert'
    );
    socket.send(JSON.stringify({ type: 'network.connect', networkId: network.id }));
    const connectionId = ((await instancePromise) as { network: { id: string } }).network.id;
    await waitFor(() => ircReceived.includes('NICK tester'));

    const joinPromise = waitForWebSocketMessage(
      socket,
      (message) =>
        message.type === 'channel.pending'
        && (message.pendingChannel as { channel?: string } | undefined)?.channel === '#help',
      'websocket join pending channel'
    );
    socket.send(JSON.stringify({ type: 'channel.join', networkId: connectionId, channel: '#help' }));
    assert.equal(((await joinPromise) as { pendingChannel: { channel: string } }).pendingChannel.channel, '#help');
    await waitFor(() => ircReceived.includes('JOIN #help'));

    const queryOpenPromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'buffer.upsert' && (message.buffer as { target?: string } | undefined)?.target === 'helper',
      'self query buffer'
    );
    const appendPromise = waitForWebSocketMessage(
      socket,
      (message) => message.type === 'message.append' && (message.message as { body?: string } | undefined)?.body === 'hello there',
      'self message.append'
    );
    socket.send(JSON.stringify({
      type: 'message.send',
      networkId: connectionId,
      target: 'helper',
      body: 'hello there',
      kind: 'message',
    }));
    assert.equal(((await queryOpenPromise) as { buffer: { target: string; kind: string } }).buffer.kind, 'query');
    const appended = await appendPromise as { message: { target: string; body: string; self: boolean } };
    assert.equal(appended.message.target, 'helper');
    assert.equal(appended.message.body, 'hello there');
    assert.equal(appended.message.self, true);
    await waitFor(() => ircReceived.includes('PRIVMSG helper :hello there'));

    socket.send(JSON.stringify({
      type: 'raw.send',
      networkId: connectionId,
      raw: 'WHOIS alice',
    }));
    await waitFor(() => ircReceived.includes('WHOIS alice'));

    socket.send(JSON.stringify({ type: 'channel.part', networkId: connectionId, channel: '#help' }));
    await waitFor(() => ircReceived.some((line) => line.startsWith('PART #help :Leaving')));
  } finally {
    for (const connectionId of Array.from(runtime.connections.keys())) {
      runtime.sessions.disconnect(connectionId);
    }
    await closeWebSocket(socket);
    ircServer.closeConnections();
    await new Promise<void>((resolve, reject) => ircServer.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('oversized websocket payloads are rejected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const runtime = createRuntime(storage);
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const closePromise = waitForWebSocketCloseDetails(socket);
    socket.send(JSON.stringify({
      type: 'raw.send',
      networkId: network.id,
      raw: 'x'.repeat(70_000),
    }));
    const close = await closePromise;
    assert.equal(close.code, 1009);
  } finally {
    socket.terminate();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('websocket validation returns errors for invalid channel, query, and message targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  storage.conversations.upsertQuery(network.id, 'helper');
  const runtime = createRuntime(storage);
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const joinErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'channel.join', networkId: network.id, channel: 'helper' }));
    assert.equal((await joinErrorPromise).message, 'Channel name must start with #, &, +, or !');

    const multiJoinErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'channel.join', networkId: network.id, channel: '#help,#ops' }));
    assert.equal((await multiJoinErrorPromise).message, 'Channel name must refer to a single channel');

    const queryErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: '#help' }));
    assert.equal((await queryErrorPromise).message, 'Private-message target is required');

    const reservedQueryErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'Server' }));
    assert.equal((await reservedQueryErrorPromise).message, 'Private-message target is required');

    const multiQueryErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'alice,bob' }));
    assert.equal((await multiQueryErrorPromise).message, 'Private-message target must refer to a single nick');

    const selfQueryErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'query.open', networkId: network.id, target: 'TESTER' }));
    assert.equal((await selfQueryErrorPromise).message, 'Private-message target cannot be your own nick');

    const messageErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'message.send', networkId: network.id, target: '   ', body: 'hello', kind: 'message' }));
    assert.equal((await messageErrorPromise).message, 'Private-message target is required');

    const multiMessageErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'message.send', networkId: network.id, target: 'alice,bob', body: 'hello', kind: 'message' }));
    assert.equal((await multiMessageErrorPromise).message, 'Private-message target must refer to a single nick');

    const selfMessageErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'message.send', networkId: network.id, target: 'tester', body: 'hello', kind: 'message' }));
    assert.equal((await selfMessageErrorPromise).message, 'Private-message target cannot be your own nick');

    const blankMessageErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'message.send', networkId: network.id, target: '#help', body: '   ', kind: 'message' }));
    assert.equal((await blankMessageErrorPromise).message, 'Message body is required');

    const blankRawErrorPromise = waitForWebSocketMessageType(socket, 'error');
    socket.send(JSON.stringify({ type: 'raw.send', networkId: network.id, raw: '   ' }));
    assert.equal((await blankRawErrorPromise).message, 'Raw command is required');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
