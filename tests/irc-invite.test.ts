import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';

const createConnection = (events: Array<{ type: string; [key: string]: unknown }>) => new IrcConnection(
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

test('irc connection surfaces channel invites as server notices', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = createConnection(events);

  connection.consume(':alice!user@example.test INVITE tester #secret\r\n');

  assert.ok(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'notice'
        && event.message === 'alice invited you to #secret'
        && event.target === undefined
    )
  );
});

test('irc connection ignores invites for other nicks', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = createConnection(events);

  connection.consume(':alice!user@example.test INVITE someone-else #secret\r\n');

  assert.deepEqual(events, []);
});
