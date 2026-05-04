import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection keeps an already joined channel after a retry JOIN times out', async () => {
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
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    },
    {
      channelJoinTimeoutMs: 20,
    }
  );

  connection.lifecycle.connected = true;
  attachMockSocket(connection, createMockSocket(writes));

  connection.join('#help');
  connection.consume(':tester!user@host JOIN #help\r\n');
  connection.consume(':alice!user@host JOIN #help\r\n');
  connection.join('#help');

  await waitFor(() => events.some((event) => event.type === 'status' && String(event.message).includes('Timed out joining #help')));

  assert.deepEqual(writes, ['JOIN #help\r\n', 'JOIN #help\r\n']);
  assert.equal(connection.getChannelSession('#help')?.phase, 'joined');
  assert.deepEqual(projectUserModes(connection.channels.users.get('#help') ?? []), [
    { nick: 'alice', mode: 'normal', away: false },
    { nick: 'tester', mode: 'normal', away: false },
  ]);
});

const projectUserModes = (users: Array<{ nick: string; mode: string; away: boolean }>) =>
  users.map(({ nick, mode, away }) => ({ nick, mode, away }));

test('irc connection surfaces private-message delivery errors from the server', async () => {
  const received: string[] = [];
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

        if (line === 'PRIVMSG sofia :hello there') {
          socket.write(':irc.example 716 tester sofia :is in +g mode (server-side ignore)\r\n');
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

  const selfMessage = events.find(
    (event) =>
      event.type === 'message'
      && (event.message as { body?: string } | undefined)?.body === 'hello there'
  ) as { message?: { id?: string } } | undefined;

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'send-failed' &&
          event.sourceTarget === '#chat' &&
          event.target === 'sofia' &&
          event.rollbackMessageId === selfMessage?.message?.id &&
          event.message === '* sofia is in +g mode (server-side ignore)'
      )
  );

  connection.disconnect();
  server.close();
});
