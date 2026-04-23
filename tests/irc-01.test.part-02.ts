import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection maps direct messages to sender buffer', async () => {
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
          socket.write(':other!user@host PRIVMSG tester :hello in private\r\n');
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
          (event as { type: string; message: { target: string; body: string } }).message.target === 'other' &&
          (event as { type: string; message: { target: string; body: string } }).message.body === 'hello in private'
      )
  );

  connection.disconnect();
  server.close();
});

test('irc connection can identify through NickServ before autojoin', async () => {
  const received: string[] = [];
  let sendIdentifySuccess: () => void = () => {
    throw new Error('NickServ success callback was not initialized');
  };

  const server = net.createServer((socket) => {
    sendIdentifySuccess = () => {
      socket.write(':NickServ!service@example NOTICE tester :You are now identified for tester.\r\n');
    };
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;
    let sawIdentify = false;

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

        if (!sawIdentify && line === 'PRIVMSG NickServ :IDENTIFY account hunter2') {
          sawIdentify = true;
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
      hasPassword: true,
      authMethod: 'nickserv',
      authTarget: 'NickServ',
      authAccount: 'account',
      password: 'hunter2',
      favorite: false,
      autoJoin: ['#chat'],
    },
    {
      onEvent: () => {},
    }
  );

  connection.connect();

  await waitFor(() => received.includes('PRIVMSG NickServ :IDENTIFY account hunter2'));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(received.includes('JOIN #chat'), false);

  sendIdentifySuccess();
  await waitFor(() => received.includes('JOIN #chat'));

  assert.equal(received.some((line) => line.startsWith('PASS ')), false);
  assert.ok(received.indexOf('PRIVMSG NickServ :IDENTIFY account hunter2') < received.indexOf('JOIN #chat'));

  connection.disconnect();
  server.close();
});
