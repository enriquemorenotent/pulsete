import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket } from './helpers/irc-race-test-helpers.js';

test('sasl plain falls back cleanly when the server does not advertise sasl', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
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
    handleIrcLine(connection, ':irc.example CAP * LS :multi-prefix');

    assert.equal(writes.at(-1), 'CAP END\r\n');
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.equal(
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'error'
          && event.message === 'Server does not advertise SASL; continuing without it'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});

test('sasl plain aborts cleanly when the server welcomes before replying to CAP LS', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
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
      autoJoin: ['#chat'],
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
    handleIrcLine(connection, ':irc.example 001 tester :Welcome');

    assert.equal(connection.lifecycle.connected, true);
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.deepEqual(writes, [
      'CAP LS 302\r\n',
      'NICK tester\r\n',
      'USER ident 0 * :Test User\r\n',
      'JOIN #chat\r\n',
    ]);
    assert.equal(
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'error'
          && event.message === 'Server completed registration before replying to CAP LS; continuing without negotiated capabilities'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});

