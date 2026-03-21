import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket } from './helpers/irc-race-test-helpers.js';

test('nick fallback keeps the attempted nick when the retry write fails', () => {
  const writes: string[] = [];
  const notices: string[] = [];
  const errors: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: 6667,
      tls: false,
      nick: 'primary',
      altNicks: ['secondary', 'tertiary'],
      username: 'tester',
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

  connection.socket = {
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
  assert.equal(connection.currentNick, 'primary');
  assert.equal(connection.pendingNick, null);
  assert.deepEqual(notices, []);
  assert.deepEqual(errors, ['Connection is no longer writable']);
});

test('connected nick changes wait for server confirmation before mutating current nick', () => {
  const writes: string[] = [];
  const states: string[] = [];
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('newnick');

  assert.equal(connection.currentNick, 'tester');
  assert.equal(connection.pendingNick, 'newnick');
  assert.deepEqual(states, []);
  assert.deepEqual(writes, ['NICK newnick\r\n']);

  handleIrcLine(connection, ':tester!user@host NICK newnick');

  assert.equal(connection.currentNick, 'newnick');
  assert.equal(connection.pendingNick, null);
  assert.deepEqual(states, ['newnick']);
});

test('pending nick self events are handled before the nick echo arrives', () => {
  const messages: Array<{ target: string; body: string; self: boolean }> = [];
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

  connection.pendingNick = 'newnick';

  handleIrcLine(connection, ':newnick!user@host JOIN #Help');
  handleIrcLine(connection, ':alice!user@host PRIVMSG NewNick :hello');
  handleIrcLine(connection, ':newnick!user@host PART #help :bye');

  assert.equal(connection.channelUsers.has('#Help'), false);
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
          statuses.push(event.message);
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('newnick');
  handleIrcLine(connection, ':irc.example 437 tester newnick :Nickname temporarily unavailable');

  assert.equal(connection.currentNick, 'tester');
  assert.equal(connection.pendingNick, null);
  assert.deepEqual(writes, ['NICK newnick\r\n']);
  assert.deepEqual(statuses, ['newnick was rejected by the server']);
});
