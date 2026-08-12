import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

type TestEvent = { type: string; kind?: string; message?: unknown };

const createProfile = (port: number) => ({
  id: randomUUID(),
  workspaceOpen: false,
  name: 'TestNet',
  host: '127.0.0.1',
  port,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  realName: 'Test User',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
});

const listen = async (server: net.Server) => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
};

const closeServer = async (server: net.Server, sockets: Set<net.Socket>) => {
  for (const socket of sockets) {
    socket.destroy();
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
};

const createWelcomeServer = (onLine: (line: string, socket: net.Socket) => void = () => {}) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let registered = false;
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (!registered && line.startsWith('USER ')) {
          registered = true;
          socket.write(':irc.example 001 tester :Welcome\r\n');
        }
        onLine(line, socket);
        index = buffer.indexOf('\n');
      }
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });
  return { server, sockets };
};

test('irc heartbeat times out a stale connected socket', async () => {
  const events: TestEvent[] = [];
  const { server, sockets } = createWelcomeServer();
  const port = await listen(server);
  const connection = new IrcConnection(
    createProfile(port),
    { onEvent: (event) => events.push(event) },
    { heartbeatIdleMs: 25, heartbeatTimeoutMs: 35 }
  );

  try {
    connection.connect();
    await waitFor(() => connection.lifecycle.connected, 400);
    await waitFor(
      () => events.some((event) =>
        event.type === 'status'
        && event.kind === 'error'
        && event.message === 'Connection heartbeat timed out'
      ),
      500
    );
    await waitFor(() => connection.lifecycle.socket === null, 400);
  } finally {
    connection.disconnect();
    await closeServer(server, sockets);
  }
});

test('irc heartbeat keeps a responsive idle connection alive', async () => {
  const events: TestEvent[] = [];
  let sawPing = false;
  const { server, sockets } = createWelcomeServer((line, socket) => {
    if (line.startsWith('PING ')) {
      sawPing = true;
      socket.write(`:irc.example PONG tester ${line.slice(5)}\r\n`);
    }
  });
  const port = await listen(server);
  const connection = new IrcConnection(
    createProfile(port),
    { onEvent: (event) => events.push(event) },
    { heartbeatIdleMs: 25, heartbeatTimeoutMs: 60 }
  );

  try {
    connection.connect();
    await waitFor(() => connection.lifecycle.connected, 400);
    await waitFor(() => sawPing, 400);
    await delay(100);
    assert.equal(connection.lifecycle.connected, true);
    assert.equal(events.some((event) => event.message === 'Connection heartbeat timed out'), false);
  } finally {
    connection.disconnect();
    await closeServer(server, sockets);
  }
});
