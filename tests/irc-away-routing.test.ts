import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';
import { createRuntimeEventHarness, messageBodies } from './helpers/runtime-conversation-event-helpers.js';

const createConnectedConnection = (events: Array<{ type: string; [key: string]: unknown }>, writes: string[]) => {
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
  return connection;
};

test('irc connection routes private-message away replies to the query target', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = createConnectedConnection(events, writes);

  connection.say('alice', 'hi', '#chat');
  connection.consume(':irc.example 301 tester alice :I am away\r\n');

  assert.deepEqual(writes, ['PRIVMSG alice :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'alice'
        && event.kind === 'system'
        && event.message === '* alice is away: I am away'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && (event.target === '#chat' || event.target === undefined)
        && event.message === '* alice is away: I am away'
    )
  );
});

test('irc connection keeps explicit WHOIS away replies on the originating buffer', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
  const connection = createConnectedConnection(events, writes);

  connection.sendClientRaw('WHOIS alice', '#whois');
  connection.consume(':irc.example 301 tester alice :I am away\r\n');

  assert.deepEqual(writes, ['WHOIS alice\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#whois'
        && event.kind === 'system'
        && event.message === '* alice is away: I am away'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'alice'
        && event.message === '* alice is away: I am away'
    )
  );
});

test('runtime appends targeted away status to the existing private-message transcript', () => {
  const harness = createRuntimeEventHarness();

  harness.publishEvent({
    type: 'message',
    currentNick: 'tester',
    message: {
      id: randomUUID(),
      networkId: harness.network.id,
      target: 'alice',
      nick: 'tester',
      body: 'hi',
      kind: 'line',
      self: true,
      ts: Date.now(),
    },
  });
  harness.publishEvent({
    type: 'status',
    networkId: harness.network.id,
    message: '* alice is away: I am away',
    kind: 'system',
    target: 'alice',
    requireBoundTarget: true,
  });

  assert.deepEqual(messageBodies(harness, 'alice'), ['hi', '* alice is away: I am away']);
  assert.deepEqual(messageBodies(harness, 'server'), []);
});
