import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection keeps tracked joins live before the nicklist arrives', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
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

  assert.equal(connection.join('#help', '#join'), true);
  connection.consume(':alice!user@host PRIVMSG #help :hello there\r\n');
  connection.consume(':irc.example 332 tester #help :Live topic\r\n');

  assert.deepEqual(writes, ['JOIN #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'message'
        && typeof event.message === 'object'
        && (event.message as { target?: string; body?: string }).target === '#help'
        && (event.message as { target?: string; body?: string }).body === 'hello there'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'channel'
        && event.channel === '#help'
        && event.topic === 'Live topic'
    )
  );
});

test('irc connection sends direct private messages to nick targets', async () => {
  const received: string[] = [];

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
        received.push(line);

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
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
      workspaceOpen: false,
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
      onEvent: () => {},
    }
  );

  connection.connect();
  await waitFor(() => received.some((line) => line.startsWith('USER ')));
  await waitFor(() => received.some((line) => line.startsWith('NICK ')));

  connection.say('sofia', 'hello in private');

  await waitFor(() => received.includes('PRIVMSG sofia :hello in private'));

  connection.disconnect();
  server.close();
});

