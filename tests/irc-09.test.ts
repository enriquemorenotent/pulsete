import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';

test('irc connection keeps delivery notices on the server buffer after channel messages', () => {
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
  attachMockSocket(connection, createMockSocket(writes));

  connection.say('#chat', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :Delivery failed\r\n');

  assert.deepEqual(writes, ['PRIVMSG #chat :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'Delivery failed';
      }
    )
  );
  assert.ok(
    !events.some(
      (event) => {
        const message = (event as { message?: { target?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === '#chat'
          && message.body === 'Delivery failed';
      }
    )
  );
});

test('irc connection keeps direct notices on the server buffer after generic raw commands', () => {
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
  attachMockSocket(connection, createMockSocket(writes));

  connection.sendClientRaw('LIST', '#chat');
  connection.consume(':irc.example NOTICE tester :maintenance soon\r\n');

  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'maintenance soon';
      }
    )
  );
});

test('irc connection keeps raw MODE 401 replies from stale private-message contexts', () => {
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
  attachMockSocket(connection, createMockSocket(writes));

  connection.say('sofia', 'hello there', '#chat');
  connection.sendClientRaw('MODE sofia', '#server');
  connection.consume(':irc.example 401 tester sofia :No such nick/channel\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n', 'MODE sofia\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: sofia'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.message === '* No such nick/channel: sofia'
    )
  );
});
