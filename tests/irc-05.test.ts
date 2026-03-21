import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection drops oversized pending lines instead of buffering indefinitely', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  let destroyed = false;
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

  connection.socket = {
    destroy() {
      destroyed = true;
    },
  } as unknown as net.Socket;

  connection.consume('x'.repeat(20_000));

  assert.equal(destroyed, true);
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
  let destroyed = false;
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

  connection.socket = {
    destroy() {
      destroyed = true;
    },
  } as unknown as net.Socket;

  connection.consume(`:irc.example NOTICE tester :${'x'.repeat(20_000)}\r\n`);

  assert.equal(destroyed, true);
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
  let destroyed = false;
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

  connection.socket = {
    destroy() {
      destroyed = true;
    },
  } as unknown as net.Socket;

  const chunk = Array.from({ length: 500 }, (_, index) => `:irc.example NOTICE tester :line ${index}\r\n`).join('');
  assert.ok(Buffer.byteLength(chunk, 'utf8') > 16 * 1024);

  connection.consume(chunk);

  assert.equal(destroyed, false);
  assert.equal(events.filter((event) => event.type === 'message').length, 500);
});
