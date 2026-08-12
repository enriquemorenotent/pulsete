import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection can authenticate through SASL before autojoin', async () => {
  const received: string[] = [];
  const password = ' hunter 2 ';
  const expectedPayload = Buffer.from(`\u0000account\u0000${password}`, 'utf8').toString('base64');

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

        if (!sentCapAck && line === 'CAP REQ :multi-prefix sasl') {
          socket.write(':irc.example CAP * ACK :multi-prefix sasl\r\n');
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
      workspaceOpen: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: address.port,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'sasl-plain',
      authAccount: 'account',
      password,
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

  assert.equal(received.some((line) => line.startsWith('PASS ')), false);
  assert.ok(received.indexOf('CAP END') < received.indexOf('JOIN #chat'));
  assert.ok(received.indexOf(`AUTHENTICATE ${expectedPayload}`) < received.indexOf('CAP END'));

  connection.disconnect();
  server.close();
});
