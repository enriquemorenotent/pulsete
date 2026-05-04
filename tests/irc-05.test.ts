import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket } from './helpers/irc-test-socket-helpers.js';

test('irc connection drops oversized pending lines instead of buffering indefinitely', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
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

  const socket = attachMockSocket(connection);

  connection.consume('x'.repeat(20_000));

  assert.equal(socket.destroyed, true);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'error'
        && event.message === 'Server sent an oversized IRC line'
    )
  );
});

test('irc connection drops oversized complete lines before dispatching them', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
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

  const socket = attachMockSocket(connection);

  connection.consume(`:irc.example NOTICE tester :${'x'.repeat(20_000)}\r\n`);

  assert.equal(socket.destroyed, true);
  assert.equal(events.some((event) => event.type === 'message'), false);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'error'
        && event.message === 'Server sent an oversized IRC line'
    )
  );
});

test('irc connection accepts large chunks when they contain complete IRC lines', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
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

  const socket = attachMockSocket(connection);

  const chunk = Array.from({ length: 500 }, (_, index) => `:irc.example NOTICE tester :line ${index}\r\n`).join('');
  assert.ok(Buffer.byteLength(chunk, 'utf8') > 16 * 1024);

  connection.consume(chunk);

  assert.equal(socket.destroyed, false);
  assert.equal(events.filter((event) => event.type === 'message').length, 500);
});
