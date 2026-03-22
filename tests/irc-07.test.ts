import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection keeps direct notices on the server buffer', async () => {
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
          socket.write(':NickServ!service@example NOTICE tester :identify now\r\n');
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
          event.type === 'message' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === 'server' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'notice' &&
          (event as { type: string; message: { target: string; kind: string; body: string } }).message.body === 'identify now'
      ),
    2_000
  );

  connection.disconnect();
  server.close();
});

test('irc connection keeps private-message delivery notices on the server buffer', async () => {
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
          sawNick = false;
          sawUser = false;
        }

        if (line === 'PRIVMSG sofia :hello there') {
          socket.write(':irc.example NOTICE tester :You need to be identified to message that user\r\n');
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
  await waitFor(() => events.some((event) => event.type === 'state' && event.phase === 'connected'));

  connection.say('sofia', 'hello there', '#chat');

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.target === 'server'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.kind === 'notice'
          && (event as { type: string; message: { target: string; kind: string; body: string } }).message.body
            === 'You need to be identified to message that user'
      ),
    2_000
  );

  connection.disconnect();
  server.close();
});

test('irc connection keeps unrelated direct server notices on the server buffer', () => {
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

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :maintenance soon\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'maintenance soon';
      }
    )
  );
});
