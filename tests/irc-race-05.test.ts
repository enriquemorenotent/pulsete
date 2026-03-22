import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket,makeUser } from './helpers/irc-race-test-helpers.js';

test('older nick conflicts do not overwrite a newer pending nick request', () => {
  const writes: string[] = [];
  const notices: Array<{ message: string; target?: string }> = [];
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

test('connecting connections reject client commands before registration completes', () => {
  const writes: string[] = [];
  const errors: Array<{ target?: string; message: string }> = [];
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

test('updating a profile while connecting restarts the handshake with the new settings', () => {
  const originalConnect = net.connect;
  const firstWrites: string[] = [];
  const secondWrites: string[] = [];
  const sockets = [createMockSocket(firstWrites), createMockSocket(secondWrites)];
  const statuses: string[] = [];
  let connectCalls = 0;
  net.connect = (() => sockets[connectCalls++]) as unknown as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'OldNet',
      host: 'old.example.test',
      port: 6667,
      tls: false,
      nick: 'oldnick',
      altNicks: ['oldnick_', 'oldnick__'],
      username: 'olduser',
      realName: 'Old User',
      hasPassword: true,
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

  try {
    connection.connect();
    connection.lifecycle.buffer = ':irc.example 001 oldnick';
    connection.channels.users.set('#help', [makeUser('alice')]);
    connection.updateProfile({
      ...connection.profile,
      name: 'NewNet',
      host: 'new.example.test',
      port: 6697,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
      hasPassword: true,
      password: 'newpass',
    });

    assert.equal(connectCalls, 2);
    assert.equal(sockets[0].destroyed, true);
    assert.equal(connection.lifecycle.buffer, '');
    assert.equal(connection.channels.users.size, 0);

    sockets[0].emit('lookup', null, '127.0.0.1', 4, 'old.example.test');
    sockets[0].emit('connect');
    assert.deepEqual(firstWrites, []);

    sockets[1].emit('lookup', null, '127.0.0.1', 4, 'new.example.test');
    sockets[1].emit('connect');

    assert.deepEqual(secondWrites, [
      'PASS newpass\r\n',
      'NICK newnick\r\n',
      'USER newuser 0 * :New User\r\n',
    ]);
    assert.ok(statuses.includes('Looking up old.example.test'));
    assert.ok(statuses.includes('Looking up new.example.test'));
    assert.ok(statuses.includes('Connecting to new.example.test (127.0.0.1:6697)'));
  } finally {
    net.connect = originalConnect;
  }
});
