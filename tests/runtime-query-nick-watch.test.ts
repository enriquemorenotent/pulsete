import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';

test('live nick changes notify open private messages and refresh watched query aliases', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const received: string[] = [];
  const server = await createMonitorNickServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
  }));
  const query = storage.conversations.upsertQuery(network.id, 'helper');

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');
    await waitFor(() => received.includes('MONITOR + helper'));

    server.send(':helper!user@host NICK guide');

    await waitFor(() => storage.conversations.getBufferByTarget(network.id, 'guide')?.id === query.id);
    await waitFor(() => received.includes('MONITOR + guide'));
    assert.deepEqual(
      storage.conversations.listMessages(network.id, 'guide', 10).map((message) => message.body),
      ['helper is now known as guide'],
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await closeServer(server.server);
    storage.close();
  }
});

test('initial offline monitor presence for open private messages does not create PM noise', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const received: string[] = [];
  const server = await createMonitorNickServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
  }));
  const query = storage.conversations.upsertQuery(network.id, 'helper');

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');
    await waitFor(() => received.includes('MONITOR + helper'));

    server.send(':irc.example 731 tester :helper');

    await waitFor(() => runtime.gateway.snapshot().queryPresence[query.id] === 'offline');
    assert.deepEqual(storage.conversations.listMessages(network.id, 'helper', 10), []);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await closeServer(server.server);
    storage.close();
  }
});

test('monitor offline transitions do not fabricate nick-change notices', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const received: string[] = [];
  const server = await createMonitorNickServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
  }));
  const query = storage.conversations.upsertQuery(network.id, 'helper');

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');
    await waitFor(() => received.includes('MONITOR + helper'));

    server.send(':irc.example 730 tester :helper!user@host');
    await waitFor(() => runtime.gateway.snapshot().queryPresence[query.id] === 'online');
    server.send(':irc.example 731 tester :helper');

    await waitFor(() => runtime.gateway.snapshot().queryPresence[query.id] === 'offline');
    assert.deepEqual(storage.conversations.listMessages(network.id, 'helper', 10), []);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await closeServer(server.server);
    storage.close();
  }
});

test('monitor updates retarget an open private message when a known alias comes online', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const received: string[] = [];
  const server = await createMonitorNickServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
  }));
  const query = storage.conversations.upsertQuery(network.id, 'guide');
  const seeded = storage.conversations.recordObservedQueryNickChange(network.id, 'guide', 'helper');

  try {
    assert.equal(seeded?.buffer.id, query.id);
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');
    await waitFor(() =>
      received.some((line) => line.startsWith('MONITOR + ') && line.includes('helper') && line.includes('guide'))
    );

    server.send(':irc.example 731 tester :helper');
    await waitFor(() => runtime.gateway.snapshot().queryPresence[query.id] === 'offline');
    server.send(':irc.example 730 tester :guide!user@host');

    await waitFor(() => storage.conversations.getBufferByTarget(network.id, 'guide')?.id === query.id);
    assert.deepEqual(
      storage.conversations.listMessages(network.id, 'guide', 10).map((message) => message.body),
      ['helper is now known as guide'],
    );
    assert.equal(runtime.gateway.snapshot().queryPresence[query.id], 'online');
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await closeServer(server.server);
    storage.close();
  }
});

const createMonitorNickServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let nick: string | null = null;
    let sawUser = false;
    let registered = false;

    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line.startsWith('NICK ')) {
          nick = line.slice('NICK '.length).trim() || nick;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (nick && sawUser && !registered) {
          registered = true;
          socket.write(`:irc.example 001 ${nick} :Welcome\r\n`);
          socket.write(`:irc.example 005 ${nick} CHANTYPES=# MONITOR=100 :are supported by this server\r\n`);
        }
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    send(line: string) {
      for (const socket of sockets) {
        socket.write(line.endsWith('\r\n') ? line : `${line}\r\n`);
      }
    },
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

const closeServer = (server: net.Server) =>
  new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
