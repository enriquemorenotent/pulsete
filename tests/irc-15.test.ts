import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection keeps queued rejoin failures bound after a self part', () => {
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
  connection.channelUsers.set('#help', [{ nick: 'tester', mode: 'normal' }]);

  connection.part('#help', 'Leaving', '#part');
  connection.join('#help', '#rejoin');
  connection.consume(':tester!user@host PART #help :Leaving\r\n');
  connection.consume(':irc.example 473 tester #help :Cannot join channel (+i)\r\n');

  assert.deepEqual(writes, ['PART #help :Leaving\r\n', 'JOIN #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#rejoin'
        && event.kind === 'error'
        && event.message === '* #help Cannot join channel (+i)'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.message === '* #help Cannot join channel (+i)'
    )
  );
});

test('irc connection clears stale part contexts after a self kick', () => {
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
  connection.channelUsers.set('#help', [{ nick: 'tester', mode: 'normal' }]);

  connection.part('#help', 'Leaving', '#part');
  connection.consume(':op!user@host KICK #help tester :bye\r\n');
  connection.sendClientRaw('TOPIC #help :new topic', '#topic');
  connection.consume(':irc.example 442 tester #help :You\'re not on that channel\r\n');

  assert.deepEqual(writes, ['PART #help :Leaving\r\n', 'TOPIC #help :new topic\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic'
        && event.kind === 'error'
        && event.message === '* #help You\'re not on that channel'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.message === '* #help You\'re not on that channel'
    )
  );
});

test('irc connection keeps queued rejoin failures bound after a self kick', () => {
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
  connection.channelUsers.set('#help', [{ nick: 'tester', mode: 'normal' }]);

  connection.part('#help', 'Leaving', '#part');
  connection.join('#help', '#rejoin');
  connection.consume(':op!user@host KICK #help tester :bye\r\n');
  connection.consume(':irc.example 473 tester #help :Cannot join channel (+i)\r\n');

  assert.deepEqual(writes, ['PART #help :Leaving\r\n', 'JOIN #help\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#rejoin'
        && event.kind === 'error'
        && event.message === '* #help Cannot join channel (+i)'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.message === '* #help Cannot join channel (+i)'
    )
  );
});
