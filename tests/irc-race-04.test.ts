import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket } from './helpers/irc-race-test-helpers.js';

test('queued connected nick changes keep the accepted nick after a later rejection', () => {
  const writes: string[] = [];
  const states: string[] = [];
  const notices: string[] = [];
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
        if (event.type === 'status' && event.kind === 'notice') {
          notices.push(event.message);
        }
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.setNick('new1', '#chat');
  connection.setNick('new2', '#chat');

  handleIrcLine(connection, ':tester!user@host NICK new1');
  handleIrcLine(connection, ':irc.example 433 tester new2 :Nickname is already in use');

  assert.equal(connection.lifecycle.currentNick, 'new1');
  assert.equal(connection.replyTracker.pendingNick, 'new2_');
  assert.deepEqual(states, ['new1']);
  assert.deepEqual(writes, [
    'NICK new1\r\n',
    'NICK new2\r\n',
    'NICK new2_\r\n',
  ]);
  assert.deepEqual(notices, ['new2 is already in use. Retrying with new2_...']);
});

test('duplicate connected nick requests are fully retired after a successful self nick change', () => {
  const writes: string[] = [];
  const states: string[] = [];
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.setNick('newnick', '#first');
  connection.setNick('newnick', '#second');

  handleIrcLine(connection, ':tester!user@host NICK newnick');
  handleIrcLine(connection, ':irc.example 433 tester newnick :Nickname is already in use');

  assert.equal(connection.lifecycle.currentNick, 'newnick');
  assert.equal(connection.replyTracker.pendingNick, null);
  assert.deepEqual(states, ['newnick']);
  assert.deepEqual(writes, [
    'NICK newnick\r\n',
    'NICK newnick\r\n',
  ]);
});

test('queued connected nick rejections keep the rejected nick bound to its original request', () => {
  const writes: string[] = [];
  const statuses: Array<{ message: string; target?: string }> = [];
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
          statuses.push({ message: event.message, target: event.target });
        }
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.setNick('bad?', '#first');
  connection.setNick('new2', '#second');

  handleIrcLine(connection, ':irc.example 432 tester bad? :Erroneous nickname');

  assert.equal(connection.lifecycle.currentNick, 'tester');
  assert.equal(connection.replyTracker.pendingNick, 'new2');
  assert.deepEqual(writes, [
    'NICK bad?\r\n',
    'NICK new2\r\n',
  ]);
  assert.deepEqual(statuses, [
    { message: 'bad? was rejected by the server', target: '#first' },
  ]);
});

test('duplicate rejected nick requests do not leave stale pending nick state behind', () => {
  const writes: string[] = [];
  const states: string[] = [];
  const statuses: Array<{ message: string; target?: string }> = [];
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
        if (event.type === 'status' && event.kind === 'error') {
          statuses.push({ message: event.message, target: event.target });
        }
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.setNick('bad?', '#first');
  connection.setNick('bad?', '#second');

  handleIrcLine(connection, ':irc.example 432 tester bad? :Erroneous nickname');
  connection.setNick('good', '#third');
  handleIrcLine(connection, ':tester!user@host NICK good');

  assert.equal(connection.lifecycle.currentNick, 'good');
  assert.equal(connection.replyTracker.pendingNick, null);
  assert.deepEqual(states, ['good']);
  assert.deepEqual(writes, [
    'NICK bad?\r\n',
    'NICK bad?\r\n',
    'NICK good\r\n',
  ]);
  assert.deepEqual(statuses.map((status) => status.message), ['bad? was rejected by the server']);
});
