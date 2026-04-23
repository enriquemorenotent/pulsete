import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket } from './helpers/irc-race-test-helpers.js';

test('sasl plain connections negotiate capabilities before completing registration', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const password = ' hunter 2 ';
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'SaslNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'ident',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'sasl-plain',
      authAccount: 'account',
      password,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event as Record<string, unknown>);
      },
    }
  );

  try {
    connection.connect();
    socket.emit('connect');

    assert.deepEqual(writes, [
      'CAP LS 302\r\n',
      'NICK tester\r\n',
      'USER ident 0 * :Test User\r\n',
    ]);

    handleIrcLine(connection, ':irc.example CAP * LS :multi-prefix sasl');
    assert.equal(writes.at(-1), 'CAP REQ :sasl\r\n');

    handleIrcLine(connection, ':irc.example CAP * ACK :sasl');
    assert.equal(writes.at(-1), 'AUTHENTICATE PLAIN\r\n');

    handleIrcLine(connection, ':irc.example AUTHENTICATE +');
    assert.equal(
      writes.at(-1),
      `AUTHENTICATE ${Buffer.from(`\u0000account\u0000${password}`, 'utf8').toString('base64')}\r\n`
    );

    handleIrcLine(connection, ':irc.example 903 tester :SASL authentication successful');

    assert.equal(writes.at(-1), 'CAP END\r\n');
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.equal(
      events.some(
        (event) => event.type === 'status' && event.message === 'SASL authentication succeeded'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});

test('sasl plain connections complete negotiation on numeric 900 success', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'SaslNet',
      host: 'irc.example.test',
      port: 6667,
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
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event as Record<string, unknown>);
      },
    }
  );

  try {
    connection.connect();
    socket.emit('connect');

    handleIrcLine(connection, ':irc.example CAP * LS :multi-prefix sasl');
    handleIrcLine(connection, ':irc.example CAP * ACK :sasl');
    handleIrcLine(connection, ':irc.example AUTHENTICATE +');
    handleIrcLine(connection, ':irc.example 900 tester account account!user@example :You are now logged in as account');

    assert.equal(writes.at(-1), 'CAP END\r\n');
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.equal(
      events.some(
        (event) => event.type === 'status' && event.message === 'You are now logged in as account'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});

test('numeric 900 releases deferred NickServ autojoin after identify', () => {
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'NickServNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'nickserv',
      authTarget: 'NickServ',
      password: 'hunter2',
      favorite: false,
      autoJoin: ['#chat'],
    },
    { onEvent() {} }
  );

  connection.lifecycle.socket = createMockSocket(writes) as any;

  handleIrcLine(connection, ':irc.example 001 tester_ :Welcome');

  assert.deepEqual(writes, ['PRIVMSG NickServ :IDENTIFY tester hunter2\r\n']);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, 'NickServ');

  handleIrcLine(connection, ':irc.example 900 tester_ tester tester!user@example :You are now logged in as tester');

  assert.deepEqual(writes, [
    'PRIVMSG NickServ :IDENTIFY tester hunter2\r\n',
    'JOIN #chat\r\n',
  ]);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, null);
});

test('nickserv identify success accepts configured service targets and notice star replies', () => {
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'NickServNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'nickserv',
      authTarget: 'NickServ@services',
      password: 'hunter2',
      favorite: false,
      autoJoin: ['#chat'],
    },
    { onEvent() {} }
  );

  connection.lifecycle.socket = createMockSocket(writes) as any;

  handleIrcLine(connection, ':irc.example 001 tester :Welcome');

  assert.deepEqual(writes, ['PRIVMSG NickServ@services :IDENTIFY tester hunter2\r\n']);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, 'NickServ@services');

  handleIrcLine(connection, ':NickServ!service@services NOTICE * :You are now logged in as tester');

  assert.deepEqual(writes, [
    'PRIVMSG NickServ@services :IDENTIFY tester hunter2\r\n',
    'JOIN #chat\r\n',
  ]);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, null);
});
