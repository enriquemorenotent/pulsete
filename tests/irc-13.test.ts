import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection expires a stalled LIST drain and allows a later retry without a terminator', async () => {
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
    },
    { channelListTimeoutMs: 20, channelListDrainGraceMs: 20 }
  );

  connection.lifecycle.connected = true;
  attachMockSocket(connection, createMockSocket(writes));

  assert.equal(connection.requestChannelList('request-1'), true);
  await waitFor(() =>
    events.some(
      (event) =>
        event.type === 'channel-list-failed'
        && event.requestId === 'request-1'
        && event.message === 'Channel list request timed out'
    )
  );

  assert.equal(connection.requestChannelList('request-2'), false);
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(connection.requestChannelList('request-2'), true);
  assert.equal(connection.channelList.session.phase, 'active');
  assert.deepEqual(writes, ['LIST\r\n', 'LIST\r\n']);
});

test('irc connection refuses a second LIST while one is already active', () => {
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

  assert.equal(connection.requestChannelList('request-1'), true);
  assert.equal(connection.requestChannelList('request-2'), false);
  assert.equal(connection.channelList.session.phase, 'active');
  assert.equal(connection.channelList.session.requestId, 'request-1');
  assert.deepEqual(connection.channelList.session.entries, []);
  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(!events.some((event) => event.type === 'channel-list-failed'));
});

test('irc connection keeps unrelated command errors from failing LIST', () => {
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

  connection.requestChannelList('request-1');
  connection.sendClientRaw('NOPE', '#chat');
  connection.consume(':irc.example 421 tester NOPE :Unknown command\r\n');
  connection.consume(':irc.example 322 tester #help 42 :Support room\r\n');
  connection.consume(':irc.example 323 tester :End of /LIST\r\n');

  assert.deepEqual(writes, ['LIST\r\n', 'NOPE\r\n']);
  assert.ok(!events.some((event) => event.type === 'channel-list-failed'));
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'error'
        && typeof event.message === 'string'
        && event.message.includes('Unknown command')
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'channel-list-completed'
        && event.requestId === 'request-1'
    )
  );
});

test('irc connection keeps raw LIST numerics on the server buffer', () => {
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
  connection.consume(':irc.example 322 tester #help 42 :Support room\r\n');

  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'system'
        && event.message === '* #help 42 Support room'
    )
  );
});
