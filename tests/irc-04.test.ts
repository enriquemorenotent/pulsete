import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection ignores stale WHO replies after friend tracking is cleared', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.setFriendNicks(['Alice']);
  connection.setFriendNicks([]);
  connection.consume(
    ':irc.example 352 tester * user host server Alice H :0 Alice\r\n',
  );
  connection.consume(':irc.example 315 tester Alice :End of WHO list\r\n');

  assert.deepEqual(writes, ['WHO Alice\r\n']);
  assert.equal(events.some((event) => event.type === 'friend-presence'), false);
});

test('irc connection skips oversized friend nicks when polling WHO', () => {
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    { onEvent() {} }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.setFriendNicks(['Alice', 'x'.repeat(600)]);

  assert.ok(writes.includes('WHO Alice\r\n'));
  assert.equal(writes.some((line) => line.includes('x'.repeat(600))), false);
});

test('irc connection times out stalled logins instead of hanging forever', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const previousTimeout = process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
  process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = '50';

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  try {
    connection.connect();
    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === 'status'
            && event.kind === 'error'
            && String(event.message).includes('Connection timed out')
        ),
      400
    );
  } finally {
    connection.disconnect();
    if (previousTimeout === undefined) {
      delete process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
    } else {
      process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = previousTimeout;
    }
    server.close();
  }
});

test('irc connection times out stalled logins even when the server stays chatty', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const previousTimeout = process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
  process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = '80';

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    const interval = setInterval(() => {
      if (!socket.destroyed) {
        socket.write(':irc.example NOTICE tester :still registering\r\n');
      }
    }, 20);
    interval.unref?.();
    socket.on('close', () => clearInterval(interval));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  try {
    connection.connect();
    await waitFor(
      () =>
        events.some(
          (event) =>
            event.type === 'status'
            && event.kind === 'error'
            && String(event.message).includes('Connection timed out')
        ),
      400
    );
  } finally {
    connection.disconnect();
    if (previousTimeout === undefined) {
      delete process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS;
    } else {
      process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS = previousTimeout;
    }
    server.close();
  }
});
