import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

test('irc connection refuses a raw LIST while a structured LIST is active', () => {
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

  assert.equal(connection.requestChannelList('request-1'), true);
  assert.equal(connection.sendClientRaw('LIST', '#chat'), false);
  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'error'
        && event.target === '#chat'
        && event.message === 'Waiting for the previous channel list response to finish'
    )
  );
});

test('irc connection routes topic change status to the affected channel', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
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
    write() {
      return true;
    },
  } as unknown as net.Socket;
  connection.channels.users.set('#help', []);

  connection.consume(':alice!user@host TOPIC #help :new topic\r\n');

  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#help'
        && event.kind === 'system'
        && event.message === 'alice changed the topic for #help'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === undefined
        && event.message === 'alice changed the topic for #help'
    )
  );
});

test('irc connection keeps topic errors bound to topic commands on the same channel', () => {
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

  connection.sendClientRaw('TOPIC #help :new topic', '#topic');
  connection.part('#help', 'Leaving', '#part');
  connection.consume(':irc.example 482 tester #help :You\'re not channel operator\r\n');

  assert.deepEqual(writes, ['TOPIC #help :new topic\r\n', 'PART #help :Leaving\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#topic'
        && event.kind === 'error'
        && event.message === '* #help You\'re not channel operator'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && event.target === '#part'
        && event.message === '* #help You\'re not channel operator'
    )
  );
});

test('irc connection clears stale channel reply contexts after a self part', () => {
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
  connection.channels.users.set('#help', [{ nick: 'tester', mode: 'normal', away: false }]);

  connection.sendClientRaw('TOPIC #help :new topic', '#topic');
  connection.part('#help', 'Leaving', '#part');
  connection.consume(':tester!user@host PART #help :Leaving\r\n');
  connection.consume(':irc.example 482 tester #help :You\'re not channel operator\r\n');

  assert.deepEqual(writes, ['TOPIC #help :new topic\r\n', 'PART #help :Leaving\r\n']);
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
        && event.target === '#topic'
        && event.message === '* #help You\'re not channel operator'
    )
  );
});
