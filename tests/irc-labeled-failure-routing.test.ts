import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';

test('irc connection routes labeled standard reply failures back to the originating buffer', () => {
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
  connection.lifecycle.capabilities.negotiated.add('labeled-response');

  connection.say('alice', 'hi', '#chat');

  const selfMessage = events.find(
    (event) =>
      event.type === 'message'
      && (event.message as { body?: string } | undefined)?.body === 'hi'
  ) as { message?: { id?: string } } | undefined;

  assert.deepEqual(writes, ['@label=lr1 PRIVMSG alice :hi\r\n']);

  connection.consume('@label=lr1 FAIL PRIVMSG CANNOTSEND :Cannot send to this user\r\n');

  assert.ok(
    events.some(
      (event) =>
        event.type === 'send-failed'
        && event.sourceTarget === '#chat'
        && event.target === 'alice'
        && event.message === '* Cannot send to this user'
        && event.rollbackMessageId === selfMessage?.message?.id
    )
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === 'status'
        && (event.target === '#chat' || event.target === 'server')
        && event.message === '* Cannot send to this user'
    ),
    false,
  );
});

