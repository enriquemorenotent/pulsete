import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket } from './helpers/irc-race-test-helpers.js';

test('older nick conflicts do not overwrite a newer pending nick request', () => {
  const writes: string[] = [];
  const notices: Array<{ message: string; target?: string }> = [];
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
        if (event.type === 'status' && event.kind === 'notice') {
          notices.push({ message: event.message, target: event.target });
        }
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.setNick('new1', '#first');
  connection.setNick('new2', '#second');

  handleIrcLine(connection, ':irc.example 433 tester new1 :Nickname is already in use');

  assert.equal(connection.lifecycle.currentNick, 'tester');
  assert.equal(connection.replyTracker.pendingNick, 'new2');
  assert.deepEqual(writes, [
    'NICK new1\r\n',
    'NICK new2\r\n',
  ]);
  assert.deepEqual(notices, [
    { message: 'new1 is already in use. Keeping new2 as the pending nick.', target: '#first' },
  ]);
});

test('profile updates retry a rejected connected nick change when the desired nick is still different', () => {
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
    { onEvent() {} }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.updateProfile({ ...connection.profile, nick: 'newnick', altNicks: ['newnick_', 'newnick__'] });
  handleIrcLine(connection, ':irc.example 437 tester newnick :Nickname temporarily unavailable');
  connection.updateProfile({ ...connection.profile, favorite: true });

  assert.equal(connection.lifecycle.currentNick, 'tester');
  assert.equal(connection.replyTracker.pendingNick, 'newnick');
  assert.deepEqual(writes, [
    'NICK newnick\r\n',
    'NICK newnick\r\n',
  ]);
});

test('connected profiles do not reconnect when only an unused password changes', () => {
  const writes: string[] = [];
  const statuses: string[] = [];
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
      hasPassword: true,
      authMethod: 'none',
      password: 'oldpass',
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        if (event.type === 'status') {
          statuses.push(event.message);
        }
      },
    }
  );

  const socket = createMockSocket(writes);
  connection.lifecycle.connected = true;
  connection.lifecycle.socket = socket as any;

  connection.updateProfile({
    ...connection.profile,
    password: 'newpass',
  });

  assert.equal(connection.lifecycle.connected, true);
  assert.equal(connection.lifecycle.socket, socket);
  assert.equal(socket.destroyed, false);
  assert.equal(connection.profile.password, 'newpass');
  assert.deepEqual(writes, []);
  assert.equal(statuses.includes('Reconnecting to apply updated network settings'), false);
});

test('connecting connections reject client commands before registration completes', () => {
  const writes: string[] = [];
  const errors: Array<{ target?: string; message: string }> = [];
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
        if (event.type === 'status' && event.kind === 'error') {
          errors.push({ target: event.target, message: event.message });
        }
      },
    }
  );

  connection.lifecycle.socket = createMockSocket(writes) as any;
  const joinSent = connection.join('#help', '#join');
  connection.say('alice', 'hello', '#chat');
  const rawSent = connection.sendClientRaw('WHOIS alice', '#raw');
  const nickSent = connection.setNick('newnick', '#nick');

  assert.equal(joinSent, false);
  assert.equal(rawSent, false);
  assert.equal(nickSent, false);
  assert.equal(connection.lifecycle.currentNick, 'tester');
  assert.equal(connection.replyTracker.pendingNick, null);
  assert.deepEqual(connection.replyTracker.pendingReplyContexts, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, [
    { target: '#join', message: 'Still connecting to server' },
    { target: '#chat', message: 'Still connecting to server' },
    { target: '#raw', message: 'Still connecting to server' },
    { target: '#nick', message: 'Still connecting to server' },
  ]);
});

