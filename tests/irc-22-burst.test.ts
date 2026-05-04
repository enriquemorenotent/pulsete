import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';
import { commandReplyBurstIdleMs } from '../server/irc-reply-context-types.js';

const getNoticeTriples = (events: Array<{ type: string; [key: string]: unknown }>) =>
  events
    .map((event) => (event as { message?: { target?: string; kind?: string; body?: string } }).message)
    .filter((message): message is { target: string; kind: string; body: string } =>
      !!message?.target && !!message.kind && !!message.body && message.kind === 'notice')
    .map((message) => [message.target, message.kind, message.body]);

const createConnectedIrc = () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
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
    { onEvent: (event) => { events.push(event); } },
  );
  connection.lifecycle.connected = true;
  attachMockSocket(connection, createMockSocket(writes));
  return { connection, events, writes };
};

test('service notice bursts stay in the originating buffer', () => {
  const { connection, events, writes } = createConnectedIrc();

  connection.say('HelpServ', '!view some_rules', '#chat');
  connection.consume(':HelpServ!service@example NOTICE tester :line one\r\n');
  connection.consume(':HelpServ!service@example NOTICE tester :line two\r\n');

  assert.deepEqual(writes, ['PRIVMSG HelpServ :!view some_rules\r\n']);
  assert.deepEqual(
    getNoticeTriples(events),
    [
      ['#chat', 'notice', 'line one'],
      ['#chat', 'notice', 'line two'],
    ],
  );
});

test('service notice burst contexts expire after a quiet gap', () => {
  const originalDateNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  try {
    const { connection, events, writes } = createConnectedIrc();

    connection.say('HelpServ', '!view some_rules', '#chat');
    now += 25;
    connection.consume(':HelpServ!service@example NOTICE tester :line one\r\n');
    now += commandReplyBurstIdleMs + 1;
    connection.consume(':HelpServ!service@example NOTICE tester :late line\r\n');

    assert.deepEqual(writes, ['PRIVMSG HelpServ :!view some_rules\r\n']);
    assert.deepEqual(
      getNoticeTriples(events),
      [
        ['#chat', 'notice', 'line one'],
        ['server', 'notice', 'late line'],
      ],
    );
  } finally {
    Date.now = originalDateNow;
  }
});
