import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('raw ISON replies stay in the originating buffer and do not affect friend presence', () => {
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
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('ISON helper', '#chat');
  connection.consume(':irc.example 303 tester :helper\r\n');

  assert.deepEqual(writes, ['ISON helper\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.message === '* Online: helper'
    )
  );
  assert.equal(events.some((event) => event.type === 'friend-presence'), false);
});

test('irc connection batches ISON snapshots for tracked nicks and keeps them out of the server log', async () => {
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

        if (line.startsWith('ISON ')) {
          const trackedNicks = line.slice('ISON '.length).trim().split(/\s+/).filter(Boolean);
          socket.write(`:irc.example 303 tester :${trackedNicks.join(' ')}\r\n`);
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

  const trackedFriends = Array.from({ length: 80 }, (_, index) => `Friend${index.toString().padStart(3, '0')}`);
  connection.setFriendNicks(trackedFriends);
  connection.connect();

  await waitFor(() => received.some((line) => line.startsWith('ISON ')));
  const expectedOnline = received
    .filter((line) => line.startsWith('ISON '))
    .flatMap((line) => line.slice('ISON '.length).trim().split(/\s+/))
    .filter(Boolean)
    .sort();
  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'friend-presence'
          && Object.entries(event.presences as Record<string, string>)
            .filter(([, presence]) => presence === 'online')
            .map(([nick]) => nick)
            .sort()
            .join(',') === expectedOnline.join(',')
      )
  );
  assert.ok(received.filter((line) => line.startsWith('ISON ')).length < trackedFriends.length);
  assert.equal(
    events.some(
      (event) => event.type === 'status' && typeof event.message === 'string' && event.message.startsWith('* Online:')
    ),
    false,
  );

  connection.disconnect();
  server.close();
});

test('irc connection ignores stale ISON replies when snapshots overlap', () => {
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
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.lifecycle.connected = false;
  connection.setFriendNicks(['Alice']);
  connection.lifecycle.connected = true;

  connection.refreshFriendPresence();
  connection.refreshFriendPresence();

  connection.consume(':irc.example 303 tester :Alice\r\n');
  assert.equal(events.some((event) => event.type === 'friend-presence'), false);

  connection.consume(':irc.example 303 tester :\r\n');
  const friendPresenceEvents = events.filter((event) => event.type === 'friend-presence');
  assert.equal(friendPresenceEvents.length, 1);
  assert.deepEqual(friendPresenceEvents[0]?.presences, { Alice: 'offline' });
  assert.equal(writes.filter((line) => line === 'ISON Alice\r\n').length, 2);
});
