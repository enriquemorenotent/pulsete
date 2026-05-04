import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';

test('irc connection keeps ambiguous same-channel 442 replies on the server buffer', () => {
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

  connection.sendClientRaw('TOPIC #help :new topic', '#topic');
  connection.part('#help', 'Leaving', '#part');
  connection.consume(':irc.example 442 tester #help :You\'re not on that channel\r\n');

  assert.deepEqual(writes, ['TOPIC #help :new topic\r\n', 'PART #help :Leaving\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'error'
        && event.message === '* #help You\'re not on that channel'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic'
        && event.message === '* #help You\'re not on that channel'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#part'
        && event.message === '* #help You\'re not on that channel'
    )
  );
});

test('irc connection clears ambiguous same-channel 442 contexts before later replies', () => {
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

  connection.sendClientRaw('TOPIC #help :old topic', '#topic-old');
  connection.part('#help', 'Leaving', '#part-old');
  connection.consume(':irc.example 442 tester #help :You\'re not on that channel\r\n');
  connection.consume(':irc.example 482 tester #help :You\'re not channel operator\r\n');

  assert.deepEqual(writes, ['TOPIC #help :old topic\r\n', 'PART #help :Leaving\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'error'
        && event.message === '* #help You\'re not channel operator'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic-old'
        && event.message === '* #help You\'re not channel operator'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#part-old'
        && event.message === '* #help You\'re not channel operator'
    )
  );
});

test('irc connection clears successful topic-change contexts before later topic numerics', () => {
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
  connection.channels.users.set('#help', []);

  connection.sendClientRaw('TOPIC #help :old topic', '#topic-old');
  connection.consume(':tester!user@host TOPIC #help :old topic\r\n');
  connection.sendClientRaw('TOPIC #help', '#topic-query');
  connection.consume(':irc.example 332 tester #help :current topic\r\n');

  assert.deepEqual(writes, ['TOPIC #help :old topic\r\n', 'TOPIC #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help current topic'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic-old'
        && event.message === '* #help current topic'
    )
  );
});
