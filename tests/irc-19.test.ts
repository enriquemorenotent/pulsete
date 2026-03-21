import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection keeps pending nick changes from stealing channel 437 replies', () => {
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

  connection.setNick('newnick', '#chat');
  connection.join('#missing', '#chat', { visiblePending: true });
  connection.consume(':irc.example 437 tester #missing :Channel is temporarily unavailable\r\n');

  assert.deepEqual(writes, ['NICK newnick\r\n', 'JOIN #missing\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('Channel is temporarily unavailable')
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.message === 'newnick was rejected by the server'
    )
  );
});

test('irc connection keeps channel 437 replies out of nick contexts regardless of queue order', () => {
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

  connection.join('#missing', '#chat', { visiblePending: true });
  connection.setNick('newnick', '#chat');
  connection.consume(':irc.example 437 tester #missing :Channel is temporarily unavailable\r\n');

  assert.deepEqual(writes, ['JOIN #missing\r\n', 'NICK newnick\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#chat'
        && String(event.message).includes('Channel is temporarily unavailable')
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.message === 'newnick was rejected by the server'
    )
  );
});

test('irc connection clears join rollback metadata after a successful self join', () => {
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

  connection.join('#help', '#chat', 'buffer-live');
  connection.consume(':tester!user@host JOIN #help\r\n');
  connection.consume(':irc.example 473 tester #help :Cannot join channel (+i)\r\n');

  assert.deepEqual(writes, ['JOIN #help\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === '#help'
          && message.kind === 'join'
          && message.body === 'tester joined #help';
      }
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && String(event.message).includes('Cannot join channel (+i)')
    )
  );
});

test('irc connection clears all pending join rollback metadata after duplicate self joins succeed', () => {
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

  connection.join('#help', '#chat', 'buffer-live');
  connection.join('#help', '#chat');
  connection.consume(':tester!user@host JOIN #help\r\n');
  connection.consume(':irc.example 473 tester #help :Cannot join channel (+i)\r\n');

  assert.deepEqual(writes, ['JOIN #help\r\n', 'JOIN #help\r\n']);
  assert.ok(
    events.some(
      (event) => {
        const message = (event as { message?: { target?: string; kind?: string; body?: string } }).message;
        return event.type === 'message'
          && message?.target === '#help'
          && message.kind === 'join'
          && message.body === 'tester joined #help';
      }
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && String(event.message).includes('Cannot join channel (+i)')
    )
  );
});
