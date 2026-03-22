import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection clears raw MODE contexts after untargeted mode errors', () => {
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

  connection.sendClientRaw('MODE alice', '#server');
  connection.consume(':irc.example 502 tester :Cant change mode for other users\r\n');
  connection.say('alice', 'hi', '#chat');
  connection.consume(':irc.example 401 tester alice :No such nick/channel\r\n');

  assert.deepEqual(writes, ['MODE alice\r\n', 'PRIVMSG alice :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.kind === 'error'
        && event.message === '* Cant change mode for other users'
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: alice'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.message === '* No such nick/channel: alice'
    )
  );
});

test('irc connection clears duplicate raw MODE contexts after untargeted mode errors', () => {
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

  connection.sendClientRaw('MODE alice', '#server-a');
  connection.sendClientRaw('MODE bob', '#server-b');
  connection.consume(':irc.example 502 tester :Cant change mode for other users\r\n');
  connection.say('bob', 'hi', '#chat-b');
  connection.consume(':irc.example 401 tester bob :No such nick/channel\r\n');

  assert.deepEqual(writes, ['MODE alice\r\n', 'MODE bob\r\n', 'PRIVMSG bob :hi\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat-b'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: bob'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === 'server'
        && event.message === '* No such nick/channel: bob'
    )
  );
});

test('irc connection clears duplicate raw MODE contexts after targeted mode errors', () => {
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

  connection.sendClientRaw('MODE bob', '#server-a');
  connection.sendClientRaw('MODE bob', '#server-b');
  connection.consume(':irc.example 401 tester bob :No such nick/channel\r\n');
  connection.say('bob', 'hi', '#chat-b');
  connection.consume(':irc.example 401 tester bob :No such nick/channel\r\n');

  assert.deepEqual(writes, ['MODE bob\r\n', 'MODE bob\r\n', 'PRIVMSG bob :hi\r\n']);
  const bobErrors = events.filter(
    (event) =>
      event.type === 'status'
      && event.kind === 'error'
      && event.message === '* No such nick/channel: bob'
  );
  assert.deepEqual(
    bobErrors.map((event) => event.target),
    ['server', '#chat-b']
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat-b'
        && event.kind === 'error'
        && event.message === '* No such nick/channel: bob'
    )
  );
});
