import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection uses MONITOR updates for tracked friend presence without logging them', async () => {
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
          socket.write(':irc.example 005 tester CHANTYPES=# MONITOR=100 :are supported by this server\r\n');
          sawNick = false;
          sawUser = false;
        }

        if (line === 'MONITOR + Alice,Bob') {
          socket.write(':irc.example 730 tester :Alice!user@host\r\n');
          socket.write(':irc.example 731 tester :Bob\r\n');
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
      personaNote: '',
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    }
  );

  connection.setFriendNicks(['Alice', 'Bob']);
  connection.connect();

  await waitFor(() => received.includes('MONITOR + Alice,Bob'));
  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'friend-presence'
          && JSON.stringify(event.presences) === JSON.stringify({
            Alice: 'online',
            Bob: 'offline',
          })
      )
  );
  assert.equal(received.some((line) => line.startsWith('ISON ')), false);
  assert.equal(
    events.some(
      (event) =>
        event.type === 'status'
        && (event.message === '* Alice!user@host' || event.message === '* Bob')
    ),
    false,
  );

  connection.disconnect();
  server.close();
});

