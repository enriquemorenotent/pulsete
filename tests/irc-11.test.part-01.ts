import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection keeps WHOIS 401 replies out of stale private-message contexts', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
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

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('WHOIS alice', '#whois');
  connection.say('alice', 'hi', '#chat');
  connection.consume(':irc.example 401 tester alice :No such nick/channel\r\n');

  assert.deepEqual(writes, ['WHOIS alice\r\n', 'PRIVMSG alice :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#whois'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: alice'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'send-failed'
        && event.sourceTarget === '#chat'
        && event.target === 'alice'
        && event.message === '* No such nick/channel: alice'
    )
  );
});

test('irc connection emits private-message 401 replies as send failures', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
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

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('alice', 'hi', '#chat');
  connection.consume(':irc.example 401 tester alice :No such nick/channel\r\n');

  const selfMessage = events.find(
    (event) =>
      event.type === 'message'
      && (event.message as { body?: string } | undefined)?.body === 'hi'
  ) as { message?: { id?: string } } | undefined;

  assert.deepEqual(writes, ['PRIVMSG alice :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'send-failed'
        && event.sourceTarget === '#chat'
        && event.target === 'alice'
        && event.message === '* No such nick/channel: alice'
        && event.rollbackMessageId === selfMessage?.message?.id
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && (event.target === '#chat' || event.target === 'server')
        && event.message === '* No such nick/channel: alice'
    )
  );
});

test('irc connection keeps generic raw-command numerics on the server buffer', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
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

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('LIST', '#chat');
  connection.consume(':irc.example 372 tester :- motd line\r\n');

  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'system'
        && event.message === '* - motd line'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.message === '* - motd line'
    )
  );
});

test('irc connection trusts echoed self messages when echo-message is negotiated', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const writes: string[] = [];
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

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;
  connection.lifecycle.capabilities.negotiated.add('echo-message');

  connection.say('alice', 'hi', '#chat');

  assert.deepEqual(writes, ['PRIVMSG alice :hi\r\n']);
  assert.equal(events.some((event) => event.type === 'message'), false);

  connection.consume('@time=2026-03-28T12:00:00.000Z :tester!user@example PRIVMSG alice :hi\r\n');

  const messageEvent = events.find((event) => event.type === 'message') as
    | { message?: { body?: string; self?: boolean; target?: string; ts?: number } }
    | undefined;

  assert.ok(messageEvent?.message);
  assert.equal(messageEvent.message.target, 'alice');
  assert.equal(messageEvent.message.body, 'hi');
  assert.equal(messageEvent.message.self, true);
  assert.equal(messageEvent.message.ts, Date.parse('2026-03-28T12:00:00.000Z'));
});

