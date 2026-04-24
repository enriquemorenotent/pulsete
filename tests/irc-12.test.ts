import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('irc connection streams dedicated LIST replies without generic status noise', () => {
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
      username: 'tester',
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

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.requestChannelList('request-1');
  connection.consume(':irc.example 321 tester Channel :Users Name\r\n');
  connection.consume(':irc.example 322 tester #help 42 :Support room\r\n');
  connection.consume(':irc.example 323 tester :End of /LIST\r\n');

  assert.deepEqual(writes, ['LIST\r\n']);
  assert.ok(
    events.some(
      (event) =>
        event.type === 'channel-list-entry'
        && event.requestId === 'request-1'
        && JSON.stringify(event.entry) === JSON.stringify({ name: '#help', users: 42, topic: 'Support room' })
    )
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'channel-list-completed'
        && event.requestId === 'request-1'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && typeof event.message === 'string'
        && event.message.includes('#help')
    )
  );
});

test('irc connection refuses a structured LIST while a raw LIST reply is still pending', () => {
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
      username: 'tester',
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

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  connection.sendClientRaw('LIST', '#chat');

  assert.equal(connection.requestChannelList('request-1'), false);
  assert.equal(connection.channelList.session.phase, 'active');
  assert.equal(connection.channelList.session.requestId, null);
  assert.deepEqual(writes, ['LIST\r\n']);
  assert.equal(connection.getChannelListRequestFailureMessage(), 'Waiting for the previous channel list response to finish');
  assert.ok(!events.some((event) => event.type === 'channel-list-failed'));

  connection.consume(':irc.example 323 tester :End of /LIST\r\n');

  assert.equal(connection.requestChannelList('request-1'), true);
  assert.deepEqual(writes, ['LIST\r\n', 'LIST\r\n']);
});

test('irc connection times out a stalled LIST, drains late numerics, and retries only after LIST ends', async () => {
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
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event);
      },
    },
    { channelListTimeoutMs: 20 }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = {
    write(chunk: string) {
      writes.push(chunk);
    },
  } as unknown as net.Socket;

  assert.equal(connection.requestChannelList('request-1'), true);
  await waitFor(() =>
    events.some(
      (event) =>
        event.type === 'channel-list-failed'
        && event.requestId === 'request-1'
        && event.message === 'Channel list request timed out'
    )
  );

  assert.equal(connection.channelList.session.phase, 'draining');
  assert.equal(connection.channelList.session.requestId, 'request-1');
  assert.equal(connection.requestChannelList('request-2'), false);

  connection.consume(':irc.example 322 tester #late 5 :Late room\r\n');
  connection.consume(':irc.example 323 tester :End of /LIST\r\n');

  assert.equal(connection.channelList.session.phase, 'idle');
  assert.equal(connection.requestChannelList('request-2'), true);
  assert.deepEqual(writes, ['LIST\r\n', 'LIST\r\n']);
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'channel-list-entry'
        && event.requestId === 'request-1'
        && JSON.stringify(event.entry) === JSON.stringify({ name: '#late', users: 5, topic: 'Late room' })
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'channel-list-completed'
        && event.requestId === 'request-1'
    )
  );
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'status'
        && typeof event.message === 'string'
        && event.message.includes('End of /LIST')
    )
  );
});
