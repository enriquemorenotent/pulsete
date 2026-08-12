import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import type { ChannelUserState } from '../shared/protocol-chat.js';
import { createMockSocket, makeUser, mockNetConnect } from './helpers/irc-race-test-helpers.js';

const projectUserModes = (users: ChannelUserState[]) =>
  users.map(({ nick, mode, away }) => ({ nick, mode, away }));

test('updating login fields during handshake restarts even on the same server', () => {
  const firstWrites: string[] = [];
  const secondWrites: string[] = [];
  const sockets = [createMockSocket(firstWrites), createMockSocket(secondWrites)];
  let connectCalls = 0;
  const restoreConnect = mockNetConnect(() => sockets[connectCalls++] ?? assert.fail('Unexpected reconnect'));

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'oldnick',
      altNicks: ['oldnick_', 'oldnick__'],
      realName: 'Old User',
      hasPassword: true,
      password: ' oldpass ',
      favorite: false,
      autoJoin: [],
    },
    { onEvent() {} }
  );

  try {
    connection.connect();
    sockets[0].emit('connect');
    assert.deepEqual(firstWrites, [
      'PASS : oldpass \r\n',
      'CAP LS 302\r\n',
      'NICK oldnick\r\n',
      'USER oldnick 0 * :Old User\r\n',
    ]);

    connection.updateProfile({
      ...connection.profile,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      realName: 'New User',
      password: ' newpass ',
    });

    assert.equal(connectCalls, 2);
    assert.equal(sockets[0].destroyed, true);
    sockets[1].emit('connect');
    assert.deepEqual(secondWrites, [
      'PASS : newpass \r\n',
      'CAP LS 302\r\n',
      'NICK newnick\r\n',
      'USER newnick 0 * :New User\r\n',
    ]);
  } finally {
    restoreConnect();
  }
});

test('multi-line names replies accumulate users across repeated 353 numerics', () => {
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

  connection.channels.users.set('#help', []);
  handleIrcLine(connection, ':irc.example 353 tester = #help :@alice +bob');
  handleIrcLine(connection, ':irc.example 353 tester = #help :carol dave');

  assert.deepEqual(projectUserModes(connection.channels.users.get('#help') ?? []), [
    makeUser('alice', 'op'),
    makeUser('bob', 'voice'),
    makeUser('carol'),
    makeUser('dave'),
  ]);
  assert.deepEqual(
    projectUserModes((events.filter((event) => event.type === 'channel').at(-1) as { users: ChannelUserState[] } | undefined)?.users ?? []),
    [
      makeUser('alice', 'op'),
      makeUser('bob', 'voice'),
      makeUser('carol'),
      makeUser('dave'),
    ]
  );
});

test('IRC self and channel matching ignores nickname and channel casing', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'Tester',
      altNicks: ['Tester_', 'Tester__'],
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

  handleIrcLine(connection, ':tester!user@host JOIN #Help');
  handleIrcLine(connection, ':other!user@host PRIVMSG #help :hello there');
  handleIrcLine(connection, ':HELPER!user@host JOIN #help');
  handleIrcLine(connection, ':helper!user@host NICK Helper');
  handleIrcLine(connection, ':HELPER!user@host QUIT :bye');

  assert.deepEqual(Array.from(connection.channels.users.keys()), ['#Help']);
  assert.deepEqual(projectUserModes(connection.channels.users.get('#Help') ?? []), [makeUser('tester')]);

  const messageEvents = events.filter(
    (event): event is { type: 'message'; message: Record<string, unknown> } => event.type === 'message'
  );
  assert.equal(messageEvents[0]?.message.target, '#Help');
  assert.equal(messageEvents[0]?.message.self, true);
  assert.equal(messageEvents[1]?.message.target, '#Help');
  assert.equal(messageEvents[1]?.message.body, 'hello there');
  assert.ok(
    messageEvents.some(
      (event) =>
        event.message.target === '#Help'
        && event.message.kind === 'quit'
        && event.message.body === 'HELPER quit (bye)'
    )
  );
  assert.equal(
    events.filter(
      (event) =>
        event.type === 'peer-nick'
        && event.oldNick === 'helper'
        && event.newNick === 'Helper'
        && event.self === false
    ).length,
    1
  );
  assert.equal(
    events.filter(
      (event) =>
        event.type === 'peer-quit'
        && event.nick === 'HELPER'
        && event.reason === 'bye'
    ).length,
    1
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === 'status'
        && event.message === 'helper is now known as Helper'
    ),
    false
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === 'status'
        && event.message === 'HELPER quit (bye)'
    ),
    false
  );
});

test('channel mode changes update nick privileges in the user list', () => {
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

  connection.channels.users.set('#help', [makeUser('alice'), makeUser('bob', 'voice')]);
  handleIrcLine(connection, ':chanop!user@host MODE #help +o-v alice bob');

  assert.deepEqual(projectUserModes(connection.channels.users.get('#help') ?? []), [
    makeUser('alice', 'op'),
    makeUser('bob'),
  ]);
  assert.deepEqual(
    projectUserModes((events.filter((event) => event.type === 'channel').at(-1) as { users: ChannelUserState[] } | undefined)?.users ?? []),
    [
      makeUser('alice', 'op'),
      makeUser('bob'),
    ]
  );
});
