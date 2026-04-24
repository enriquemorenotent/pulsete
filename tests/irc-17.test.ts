import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection clears duplicate successful topic-change contexts before later topic numerics', () => {
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
  connection.channels.users.set('#help', []);

  connection.sendClientRaw('TOPIC #help :one', '#topic-a');
  connection.sendClientRaw('TOPIC #help :two', '#topic-b');
  connection.consume(':tester!user@host TOPIC #help :two\r\n');
  connection.sendClientRaw('TOPIC #help', '#topic-query');
  connection.consume(':irc.example 332 tester #help :two\r\n');

  assert.deepEqual(writes, ['TOPIC #help :one\r\n', 'TOPIC #help :two\r\n', 'TOPIC #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'system'
        && event.message === '* #help two'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && (event.target === '#topic-a' || event.target === '#topic-b')
        && event.message === '* #help two'
    )
  );
});

test('irc connection clears duplicate topic-error contexts for the same channel', () => {
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
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: () => {},
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;
  connection.trackChannel('#help');

  connection.sendClientRaw('TOPIC #help :locked', '#topic-a');
  connection.sendClientRaw('TOPIC #help :locked', '#topic-b');
  connection.consume(':irc.example 482 tester #help :You\'re not channel operator\r\n');

  assert.deepEqual(writes, ['TOPIC #help :locked\r\n', 'TOPIC #help :locked\r\n']);
  assert.equal(
    connection.replyTracker.pendingReplyContexts.some(
      (context) =>
        context.kind === 'channel'
        && context.operation === 'topic-set'
        && context.channel === '#help'
    ),
    false
  );
});

test('irc connection keeps older topic-change contexts after a later topic self echo', () => {
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
  connection.channels.users.set('#help', []);

  connection.sendClientRaw('TOPIC #help :one', '#topic-a');
  connection.sendClientRaw('TOPIC #help :two', '#topic-b');
  connection.consume(':tester!user@host TOPIC #help :two\r\n');
  connection.consume(':irc.example 482 tester #help :You\'re not channel operator\r\n');

  assert.deepEqual(writes, ['TOPIC #help :one\r\n', 'TOPIC #help :two\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic-a'
        && event.kind === 'error'
        && event.message === '* #help You\'re not channel operator'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic-b'
        && event.message === '* #help You\'re not channel operator'
    )
  );
});

test('irc connection surfaces otherwise unformatted numerics from raw commands', () => {
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

  connection.sendClientRaw('MODE #help', '#chat');
  connection.consume(':irc.example 324 tester #help +nt\r\n');

  assert.deepEqual(writes, ['MODE #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.kind === 'system'
        && event.message === '* #help +nt'
    )
  );
});
