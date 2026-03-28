import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection routes whois replies to the originating buffer', async () => {
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

        if (line === 'WHOIS helper') {
          socket.write(':irc.example 311 tester helper helper users.example * :Helper Person\r\n');
          socket.write(':irc.example 319 tester helper :#chat @#ops\r\n');
          socket.write(':irc.example 312 tester helper irc.example :Example IRC Server\r\n');
          socket.write(':irc.example 317 tester helper 125 1700000000 :seconds idle, signon time\r\n');
          socket.write(':irc.example 318 tester helper :End of /WHOIS list.\r\n');
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

  assert.equal(connection.sendClientRaw('WHOIS helper', '#chat'), true);

  await waitFor(
    () =>
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper is helper@users.example (Helper Person)'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper is on #chat @#ops'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper is using irc.example (Example IRC Server)'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* helper has been idle for 2m 5s'
      )
      && events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'system'
          && event.target === '#chat'
          && event.message === '* End of WHOIS for helper'
      )
  );

  connection.disconnect();
  server.close();

  assert.ok(received.includes('WHOIS helper'));
});

test('irc connection routes duplicate WHOIS replies for the same nick in request order', () => {
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

  connection.sendClientRaw('WHOIS alice', '#first');
  connection.sendClientRaw('WHOIS alice', '#second');
  connection.consume(':irc.example 311 tester alice user host * :Alice Example\r\n');
  connection.consume(':irc.example 318 tester alice :End of /WHOIS list.\r\n');
  connection.consume(':irc.example 311 tester alice user host * :Alice Example\r\n');
  connection.consume(':irc.example 318 tester alice :End of /WHOIS list.\r\n');

  assert.deepEqual(writes, ['WHOIS alice\r\n', 'WHOIS alice\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#first'
        && event.kind === 'system'
        && event.message === '* alice is user@host (Alice Example)'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#first'
        && event.kind === 'system'
        && event.message === '* End of WHOIS for alice'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#second'
        && event.kind === 'system'
        && event.message === '* alice is user@host (Alice Example)'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#second'
        && event.kind === 'system'
        && event.message === '* End of WHOIS for alice'
    )
  );
});

test('irc connection routes labeled WHOIS replies to the matching buffer even when they arrive out of order', () => {
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
  connection.lifecycle.capabilities.negotiated.add('labeled-response');

  connection.sendClientRaw('WHOIS alice', '#first');
  connection.sendClientRaw('WHOIS alice', '#second');

  assert.deepEqual(writes, ['@label=lr1 WHOIS alice\r\n', '@label=lr2 WHOIS alice\r\n']);

  connection.consume('@label=lr2 :irc.example 311 tester alice user host-two * :Second Reply\r\n');
  connection.consume('@label=lr2 :irc.example 318 tester alice :End of /WHOIS list.\r\n');
  connection.consume('@label=lr1 :irc.example 311 tester alice user host-one * :First Reply\r\n');
  connection.consume('@label=lr1 :irc.example 318 tester alice :End of /WHOIS list.\r\n');

  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#second'
        && event.kind === 'system'
        && event.message === '* alice is user@host-two (Second Reply)'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#first'
        && event.kind === 'system'
        && event.message === '* alice is user@host-one (First Reply)'
    )
  );
});
