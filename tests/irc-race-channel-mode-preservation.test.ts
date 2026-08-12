import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import type { ChannelUserState } from '../shared/protocol-chat.js';
import { makeUser } from './helpers/irc-race-test-helpers.js';

const projectUserModes = (users: ChannelUserState[]) =>
  users.map(({ nick, mode, away }) => ({ nick, mode, away }));

const projectUserModeSets = (users: ChannelUserState[]) =>
  users.map(({ nick, mode, modes }) => ({ nick, mode, modes }));

test('names replies preserve stacked channel user prefixes', () => {
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

  connection.channels.users.set('#help', []);
  handleIrcLine(connection, ':irc.example 353 tester = #help :@+alice');

  assert.deepEqual(projectUserModeSets(connection.channels.users.get('#help') ?? []), [
    { nick: 'alice', mode: 'op', modes: ['op', 'voice'] },
  ]);
});

test('channel mode changes preserve user updates when channel modes are mixed in', () => {
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

  connection.channels.users.set('#help', [makeUser('alice', 'op')]);
  handleIrcLine(connection, ':chanop!user@host MODE #help +nt-o alice');

  assert.deepEqual(projectUserModes(connection.channels.users.get('#help') ?? []), [makeUser('alice')]);
});

test('channel mode removals preserve lower active modes', () => {
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

  connection.channels.users.set('#help', [
    { nick: 'alice', mode: 'op', modes: ['op', 'voice'], away: false },
  ]);
  handleIrcLine(connection, ':chanop!user@host MODE #help -o alice');

  assert.deepEqual(projectUserModeSets(connection.channels.users.get('#help') ?? []), [
    { nick: 'alice', mode: 'voice', modes: ['voice'] },
  ]);
});
