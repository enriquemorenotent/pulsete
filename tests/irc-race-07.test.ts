import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import type { ChannelUserState } from '../shared/protocol-chat.js';
import { createMockSocket, makeUser, mockNetConnect } from './helpers/irc-race-test-helpers.js';

const projectUserModes = (users: ChannelUserState[]) =>
  users.map(({ nick, mode, away }) => ({ nick, mode, away }));

test('channel mode changes keep user updates aligned after unknown arg-taking modes', () => {
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
      onEvent: () => {},
    }
  );

  connection.channels.users.set('#help', [makeUser('alice')]);
  handleIrcLine(connection, ':chanop!user@host MODE #help +Lo #overflow alice');

  assert.deepEqual(projectUserModes(connection.channels.users.get('#help') ?? []), [makeUser('alice', 'op')]);
});

test('self kicks emit a self part message and remove channel membership', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
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
        events.push(event);
      },
    }
  );

  connection.channels.users.set('#help', [makeUser('tester'), makeUser('alice')]);
  handleIrcLine(connection, ':op!user@host KICK #help tester :bye');

  assert.equal(connection.channels.users.has('#help'), false);
  const messageEvent = events.find((event) => event.type === 'message') as {
    type: 'message';
    message: { networkId: string; target: string; nick: string; body: string; kind: string; self: boolean };
  } | undefined;
  assert.ok(messageEvent);
  assert.equal(messageEvent.message.networkId, connection.profile.id);
  assert.equal(messageEvent.message.target, '#help');
  assert.equal(messageEvent.message.nick, 'tester');
  assert.equal(messageEvent.message.body, 'tester was kicked from #help by op (bye)');
  assert.equal(messageEvent.message.kind, 'part');
  assert.equal(messageEvent.message.self, true);
});

test('self part removes local channel state without emitting a replacement channel event', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: '127.0.0.1',
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
        events.push(event);
      },
    }
  );

  connection.channels.users.set('#help', [makeUser('tester'), makeUser('alice')]);

  handleIrcLine(connection, ':tester!user@host PART #help :Leaving');

  assert.equal(connection.channels.users.has('#help'), false);
  assert.deepEqual(
    events.filter((event) => event.type === 'channel'),
    []
  );
  const messageEvent = events.find(
    (event): event is { type: 'message'; message: Record<string, unknown> } => event.type === 'message'
  );
  assert.ok(messageEvent);
  assert.equal(messageEvent.message.networkId, connection.profile.id);
  assert.equal(messageEvent.message.target, '#help');
  assert.equal(messageEvent.message.nick, 'tester');
  assert.equal(messageEvent.message.body, 'tester left #help (Leaving)');
  assert.equal(messageEvent.message.kind, 'part');
  assert.equal(messageEvent.message.self, true);
  assert.equal(typeof messageEvent.message.id, 'string');
  assert.equal(typeof messageEvent.message.ts, 'number');
});

test('late channel events and messages do not recreate a self-parted channel', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: '127.0.0.1',
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
        events.push(event);
      },
    }
  );

  connection.channels.users.set('#help', [makeUser('tester'), makeUser('alice')]);
  handleIrcLine(connection, ':tester!user@host PART #help :Leaving');
  const afterPartEvents = events.length;

  handleIrcLine(connection, ':alice!user@host JOIN #help');
  handleIrcLine(connection, ':alice!user@host PART #help :Later');
  handleIrcLine(connection, ':alice!user@host PRIVMSG #help :stale line');
  handleIrcLine(connection, ':alice!user@host TOPIC #help :Topic line');
  handleIrcLine(connection, ':irc.example 332 tester #help :Topic line');
  handleIrcLine(connection, ':irc.example 353 tester = #help :@tester +alice');

  assert.equal(connection.channels.users.has('#help'), false);
  assert.deepEqual(
    events.slice(afterPartEvents).filter((event) => event.type === 'channel' || event.type === 'message'),
    []
  );
});

test('socket close clears parser buffers and nick tracking', () => {
  const writes: string[] = [];
  const socket = createMockSocket(writes);
  const restoreConnect = mockNetConnect(socket);

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: 'close.example.test',
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

  try {
    connection.connect();
    connection.lifecycle.buffer = ':irc.example 001 tester';
    connection.channels.users.set('#help', [makeUser('alice')]);
    connection.lifecycle.manualDisconnect = true;

    socket.emit('close');

    assert.equal(connection.lifecycle.buffer, '');
    assert.equal(connection.channels.users.size, 0);
  } finally {
    restoreConnect();
  }
});
