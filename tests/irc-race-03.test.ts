import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket, makeUser } from './helpers/irc-race-test-helpers.js';

test('nick fallback keeps the attempted nick when the retry write fails', () => {
  const writes: string[] = [];
  const notices: string[] = [];
  const errors: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: 6667,
      tls: false,
      nick: 'primary',
      altNicks: ['secondary', 'tertiary'],
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        if (event.type === 'status' && event.kind === 'notice') {
          notices.push(event.message);
        }
        if (event.type === 'status' && event.kind === 'error') {
          errors.push(event.message);
        }
      },
    }
  );

  connection.lifecycle.socket = {
    write(line: string) {
      writes.push(line);
      throw new Error('boom');
    },
    end() {},
    setEncoding() {},
    destroy() {},
    on() {
      return this;
    },
  } as any;

  handleIrcLine(connection, ':irc.example 433 * primary :Nickname is already in use');

  assert.deepEqual(writes, ['NICK secondary\r\n']);
  assert.equal(connection.lifecycle.currentNick, 'primary');
  assert.equal(connection.replyTracker.pendingNick, null);
  assert.deepEqual(notices, []);
  assert.deepEqual(errors, ['Connection is no longer writable']);
});

test('connected nick changes wait for server confirmation before mutating current nick', () => {
  const writes: string[] = [];
  const states: string[] = [];
  const peerNickEvents: Array<{ oldNick: string; newNick: string; self: boolean }> = [];
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
        if (event.type === 'peer-nick') {
          peerNickEvents.push({
            oldNick: event.oldNick,
            newNick: event.newNick,
            self: event.self,
          });
        }
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.channels.users.set('#Help', [makeUser('tester'), makeUser('alice')]);
  connection.setNick('newnick');

  assert.equal(connection.lifecycle.currentNick, 'tester');
  assert.equal(connection.replyTracker.pendingNick, 'newnick');
  assert.deepEqual(states, []);
  assert.deepEqual(writes, ['NICK newnick\r\n']);

  handleIrcLine(connection, ':tester!user@host NICK newnick');

  assert.equal(connection.lifecycle.currentNick, 'newnick');
  assert.equal(connection.replyTracker.pendingNick, null);
  assert.deepEqual(
    connection.channels.users.get('#Help')?.map((user) => ({ nick: user.nick, mode: user.mode, away: user.away })),
    [makeUser('alice'), makeUser('newnick')]
  );
  assert.deepEqual(states, ['newnick']);
  assert.deepEqual(peerNickEvents, [{ oldNick: 'tester', newNick: 'newnick', self: true }]);
});

test('pending nick self events are handled before the nick echo arrives', () => {
  const messages: Array<{ target: string; body: string; self: boolean }> = [];
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
        if (event.type === 'message') {
          messages.push({
            target: event.message.target,
            body: event.message.body,
            self: event.message.self,
          });
        }
      },
    }
  );

  connection.replyTracker.setPendingNick('newnick');

  handleIrcLine(connection, ':newnick!user@host JOIN #Help');
  handleIrcLine(connection, ':alice!user@host PRIVMSG NewNick :hello');
  handleIrcLine(connection, ':newnick!user@host PART #help :bye');

  assert.equal(connection.channels.users.has('#Help'), false);
  assert.equal(connection.getChannelSession('#help'), null);
  assert.deepEqual(messages.map((message) => ({ ...message, body: message.body.replace(/\s+/g, ' ') })), [
    { target: '#Help', body: 'newnick joined #Help', self: true },
    { target: 'alice', body: 'hello', self: false },
    { target: '#Help', body: 'newnick left #Help (bye)', self: true },
  ]);
});

test('rejected connected nick changes keep the last accepted nick', () => {
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
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        if (event.type === 'status' && event.kind === 'error') {
          statuses.push(event.message);
        }
      },
    }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket(writes) as any;
  connection.setNick('newnick');
  handleIrcLine(connection, ':irc.example 437 tester newnick :Nickname temporarily unavailable');

  assert.equal(connection.lifecycle.currentNick, 'tester');
  assert.equal(connection.replyTracker.pendingNick, null);
  assert.deepEqual(writes, ['NICK newnick\r\n']);
  assert.deepEqual(statuses, ['newnick was rejected by the server']);
});
