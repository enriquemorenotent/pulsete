import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('service notice replies to a bot command stay in the source buffer', () => {
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
    },
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('HelpServ', '!view some_rules', '#chat');
  connection.consume(':HelpServ!service@example NOTICE tester :some_rules: be nice\r\n');

  assert.deepEqual(writes, ['PRIVMSG HelpServ :!view some_rules\r\n']);
  assert.ok(
    events.some((event) => {
      const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
      return event.type === 'message'
        && message?.target === '#chat'
        && message.kind === 'notice'
        && message.body === 'some_rules: be nice';
    }),
  );
});

test('service notice replies match configured service targets and stay in the source buffer', () => {
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
    },
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('HelpServ@services', '!view some_rules', '#chat');
  connection.consume(':HelpServ!service@services NOTICE tester :some_rules: be nice\r\n');

  assert.deepEqual(writes, ['PRIVMSG HelpServ@services :!view some_rules\r\n']);
  assert.ok(
    events.some((event) => {
      const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
      return event.type === 'message'
        && message?.target === '#chat'
        && message.kind === 'notice'
        && message.body === 'some_rules: be nice';
    }),
  );
});

test('channel command notices stay in the originating channel buffer', () => {
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
    },
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('#chat', '!view some_rules', '#chat');
  connection.consume(':helper!bot@example NOTICE tester :some_rules: be nice\r\n');

  assert.deepEqual(writes, ['PRIVMSG #chat :!view some_rules\r\n']);
  assert.ok(
    events.some((event) => {
      const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
      return event.type === 'message'
        && message?.target === '#chat'
        && message.kind === 'notice'
        && message.body === 'some_rules: be nice';
    }),
  );
});
