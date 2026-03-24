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

  assert.equal(received.includes('PASS hunter2'), false);
  assert.ok(received.indexOf('PRIVMSG NickServ :IDENTIFY account hunter2') < received.indexOf('JOIN #chat'));

  connection.disconnect();
  server.close();
});

test('irc connection can authenticate through SASL before autojoin', async () => {
  const received: string[] = [];
  const expectedPayload = Buffer.from('\u0000account\u0000hunter2', 'utf8').toString('base64');

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sentCapList = false;
    let sentCapAck = false;
    let sentAuthenticatePrompt = false;
    let sentSuccess = false;
    let sentWelcome = false;
    let sawCapLs = false;
    let sawNick = false;
    let sawUser = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);

        if (line === 'CAP LS 302') {
          sawCapLs = true;
        }

        if (line.startsWith('NICK ')) {
          sawNick = true;
        }

        if (line.startsWith('USER ')) {
          sawUser = true;
        }

        if (!sentCapList && sawCapLs && sawNick && sawUser) {
          socket.write(':irc.example CAP * LS :multi-prefix sasl\r\n');
          sentCapList = true;
        }

        if (!sentCapAck && line === 'CAP REQ :sasl') {
          socket.write(':irc.example CAP * ACK :sasl\r\n');
          sentCapAck = true;
        }

        if (!sentAuthenticatePrompt && line === 'AUTHENTICATE PLAIN') {
          socket.write(':irc.example AUTHENTICATE +\r\n');
          sentAuthenticatePrompt = true;
        }

        if (!sentSuccess && line === `AUTHENTICATE ${expectedPayload}`) {
          socket.write(':irc.example 903 tester :SASL authentication successful\r\n');
          sentSuccess = true;
        }

        if (!sentWelcome && line === 'CAP END') {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sentWelcome = true;
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
      username: 'ident',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'sasl-plain',
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

  await waitFor(() => received.includes(`AUTHENTICATE ${expectedPayload}`));
  await waitFor(() => received.includes('CAP END'));
  await waitFor(() => received.includes('JOIN #chat'));

  assert.equal(received.includes('PASS hunter2'), false);
  assert.ok(received.indexOf('CAP END') < received.indexOf('JOIN #chat'));
  assert.ok(received.indexOf(`AUTHENTICATE ${expectedPayload}`) < received.indexOf('CAP END'));

  connection.disconnect();
  server.close();
});
