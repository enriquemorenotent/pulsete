import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection keeps direct service messages on the server buffer', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          socket.write(':NickServ!service@example PRIVMSG tester :Use IDENTIFY first\r\n');
          sawNick = false;
          sawUser = false;
        }

        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
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

  connection.connect();

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === 'server'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'line'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.body === 'Use IDENTIFY first'
      ),
    2_000
  );

  assert.equal(
    events.some(
      (event) =>
        event.type === 'message'
        && (event as { type: string; message: { target: string } }).message.target === 'NickServ'
    ),
    false
  );

  connection.disconnect();
  server.close();
});

test('irc connection reports failed connects without a generic closed notice', async () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const server = net.createServer();

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { port } = address;

  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'BrokenNet',
      host: '127.0.0.1',
      port,
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

  connection.connect();

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'error'
          && String(event.message).includes(`Unable to connect to 127.0.0.1:${port}`)
      )
  );
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.ok(!events.some((event) => event.type === 'status' && event.message === 'Connection closed'));

  connection.disconnect();
});
