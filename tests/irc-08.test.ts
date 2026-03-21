import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection keeps unrelated auth notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :You need to be identified to use that command\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'You need to be identified to use that command';
      }
    )
  );
});

test('irc connection keeps unrelated cannot-send notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :Cannot send invites while restricted\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'Cannot send invites while restricted';
      }
    )
  );
});

test('irc connection keeps message blocked notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('sofia', 'hello there', '#chat');
  connection.consume(':irc.example NOTICE tester :Message blocked by policy\r\n');

  assert.deepEqual(writes, ['PRIVMSG sofia :hello there\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === 'server'
          && message.kind === 'notice'
          && message.body === 'Message blocked by policy';
      }
    )
  );
});

test('irc connection keeps ambiguous delivery notices on the server buffer', () => {
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

  connection.connected = true;
  connection.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.say('alice', 'hi', '#chat-a');
  connection.say('bob', 'hi', '#chat-b');
  connection.consume(':irc.example NOTICE tester :Delivery failed\r\n');

  assert.deepEqual(writes, ['PRIVMSG alice :hi\r\n', 'PRIVMSG bob :hi\r\n']);
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
          && (message?.target === '#chat-a' || message?.target === '#chat-b')
          && message.body === 'Delivery failed';
      }
    )
  );
});
