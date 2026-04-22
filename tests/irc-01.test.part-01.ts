import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection negotiates, joins, and parses messages', async () => {
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
          socket.write(':irc.example 005 tester CHANTYPES=# NETWORK=TestNet :are supported by this server\r\n');
          socket.write(':irc.example 372 tester :- \u000304hello from motd\u000f\r\n');
          socket.write(':irc.example 376 tester :End of /MOTD command.\r\n');
        }

        if (line.startsWith('JOIN ')) {
          const channel = line.slice(5);
          socket.write(`:tester!user@host JOIN ${channel}\r\n`);
          socket.write(`:irc.example 353 tester = ${channel} :@tester +helper\r\n`);
          socket.write(`:irc.example 332 tester ${channel} :Topic line\r\n`);
        }

        if (line.startsWith('PRIVMSG ')) {
          const target = line.split(' ')[1];
          if (line.includes('\u0001ACTION ')) {
            socket.write(`:other!user@host PRIVMSG ${target} :\u0001ACTION waves back\u0001\r\n`);
          } else {
            socket.write(`:other!user@host PRIVMSG ${target} :\u0002reply from server\u000f\r\n`);
          }
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
      autoJoin: ['#chat'],
      personaNote: '',
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.connect();

  await waitFor(() => events.some((event) => event.type === 'state' && event.phase === 'connected'));
  await waitFor(() => received.some((line) => line.startsWith('JOIN #chat')));

  connection.say('#chat', 'hello there');

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { body: string; self: boolean } }).message.body === 'hello there' &&
          (event as { type: string; message: { body: string; self: boolean } }).message.self === true
      )
  );

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { body: string } }).message.body === '\u0002reply from server\u000F'
      )
  );

  connection.action('#chat', 'waves');

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { kind: string; body: string; self: boolean } }).message.kind === 'action' &&
          (event as { type: string; message: { kind: string; body: string; self: boolean } }).message.body === 'waves' &&
          (event as { type: string; message: { kind: string; body: string; self: boolean } }).message.self === true
      )
  );

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'message' &&
          (event as { type: string; message: { kind: string; body: string; self: boolean } }).message.kind === 'action' &&
          (event as { type: string; message: { kind: string; body: string; self: boolean } }).message.body === 'waves back' &&
          (event as { type: string; message: { kind: string; body: string; self: boolean } }).message.self === false
      )
  );

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* Welcome'
      ) &&
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* CHANTYPES=# NETWORK=TestNet are supported by this server'
      ) &&
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* - \u000304hello from motd\u000F'
      ) &&
      events.some(
        (event) =>
          event.type === 'status' &&
          event.kind === 'system' &&
          event.message === '* End of /MOTD command.'
      )
  );

  connection.disconnect();
  server.close();

  assert.ok(received.some((line) => line.startsWith('NICK tester')));
  assert.ok(received.some((line) => line.startsWith('PRIVMSG #chat :hello there')));
  assert.ok(received.some((line) => line.startsWith('PRIVMSG #chat :\u0001ACTION waves\u0001')));
  assert.ok(events.some((event) => event.type === 'channel'));
});

