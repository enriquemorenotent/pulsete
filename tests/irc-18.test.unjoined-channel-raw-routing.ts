import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';

test('irc connection surfaces raw NAMES payloads for unjoined channels', () => {
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

  connection.sendClientRaw('NAMES #help', '#chat');
  connection.consume(':irc.example 353 tester = #help :@alice bob\r\n');
  connection.consume(':irc.example 366 tester #help :End of /NAMES list.\r\n');

  assert.deepEqual(writes, ['NAMES #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help @alice bob'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help End of /NAMES list.'
    )
  );
});

test('irc connection surfaces raw TOPIC payloads for unjoined channels', () => {
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

  connection.sendClientRaw('TOPIC #help', '#chat');
  connection.consume(':irc.example 332 tester #help :Current topic\r\n');
  connection.consume(':irc.example 333 tester #help alice 123\r\n');

  assert.deepEqual(writes, ['TOPIC #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help Current topic'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'system'
        && event.message === '* #help alice 123'
    )
  );
});

test('irc connection routes rejected joins through the pending session target', () => {
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

  connection.join('#missing', '#chat', { visiblePending: true });
  connection.consume(':irc.example 403 tester #missing :No such channel\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('No such channel')
    )
  );
});

test('irc connection routes 437 rejected joins through the pending session target', () => {
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

  connection.join('#missing', '#chat', { visiblePending: true });
  connection.consume(':irc.example 437 tester #missing :Channel is temporarily unavailable\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('Channel is temporarily unavailable')
    )
  );
});

