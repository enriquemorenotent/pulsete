import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket } from './helpers/irc-race-test-helpers.js';

test('reconnect timers are unrefd and cleared on manual disconnect', () => {
  const originalConnect = net.connect;
  const socket = createMockSocket([]);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'RetryNet',
      host: 'retry.example.test',
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

  try {
    connection.connect();
    socket.emit('close');

    assert.notEqual(connection.lifecycle.reconnectTimer, null);
    assert.equal(connection.lifecycle.reconnectTimer?.hasRef?.(), false);

    connection.disconnect();

    assert.equal(connection.lifecycle.reconnectTimer, null);
  } finally {
    net.connect = originalConnect;
  }
});

test('manual reconnect resets the exhausted retry budget', () => {
  const originalConnect = net.connect;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduled: Array<{ callback: () => void; delay: number; cancelled: boolean }> = [];
  const sockets = Array.from({ length: 5 }, () => createMockSocket([]));
  let connectCalls = 0;
  net.connect = (() => sockets[connectCalls++] as unknown as net.Socket) as typeof net.connect;
  global.setTimeout = (((callback: () => void, delay?: number) => {
    const entry = {
      callback,
      delay: Number(delay ?? 0),
      cancelled: false,
    };
    scheduled.push(entry);
    return {
      __entry: entry,
      unref() {
        return this;
      },
      hasRef() {
        return false;
      },
    } as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  global.clearTimeout = (((handle?: ReturnType<typeof setTimeout>) => {
    const entry = (handle as (ReturnType<typeof setTimeout> & { __entry?: typeof scheduled[number] }) | undefined)?.__entry;
    if (entry) {
      entry.cancelled = true;
    }
  }) as typeof clearTimeout);

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'RetryNet',
      host: 'retry.example.test',
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

  try {
    const runNextReconnectTimer = () => {
      const next = scheduled.find((entry) => !entry.cancelled && entry.delay < 15_000);
      if (!next) {
        return;
      }
      next.cancelled = true;
      next.callback();
    };
    const activeTimers = () => scheduled.filter((entry) => !entry.cancelled);

    connection.connect();
    sockets[0].emit('close');
    runNextReconnectTimer();
    sockets[1].emit('close');
    runNextReconnectTimer();
    sockets[2].emit('close');
    runNextReconnectTimer();
    sockets[3].emit('close');

    assert.equal(activeTimers().length, 0);

    connection.connect();
    sockets[4].emit('close');

    assert.equal(activeTimers().length, 1);
  } finally {
    net.connect = originalConnect;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('nick fallback uses the updated profile nick after reconnecting', () => {
  const writes: string[] = [];
  const createMockSocket = () => ({
    write(line: string) {
      writes.push(line);
    },
    end() {},
    setEncoding() {},
    on() {
      return this;
    },
  });
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: 6667,
      tls: false,
      nick: 'oldnick',
      altNicks: ['oldnick_', 'oldnick__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    { onEvent() {} }
  );

  connection.lifecycle.connected = true;
  connection.lifecycle.socket = createMockSocket() as any;
  connection.updateProfile({ ...connection.profile, nick: 'newnick', altNicks: ['newnick_', 'newnick__'] });
  connection.disconnect();
  connection.lifecycle.socket = createMockSocket() as any;

  handleIrcLine(connection, ':irc.example 433 * newnick :Nickname is already in use');

  assert.equal(connection.lifecycle.currentNick, 'newnick_');
  assert.ok(writes.includes('NICK newnick_\r\n'));
});

test('nick conflicts use configured alternate nicknames before suffix fallback', () => {
  const writes: string[] = [];
  const socket = {
    write(line: string) {
      writes.push(line);
    },
    end() {},
    setEncoding() {},
    on() {
      return this;
    },
  };
  const notices: string[] = [];
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
      },
    }
  );

  connection.lifecycle.socket = socket as any;
  handleIrcLine(connection, ':irc.example 433 * primary :Nickname is already in use');
  handleIrcLine(connection, ':irc.example 433 * secondary :Nickname is already in use');
  handleIrcLine(connection, ':irc.example 433 * tertiary :Nickname is already in use');

  assert.deepEqual(writes, [
    'NICK secondary\r\n',
    'NICK tertiary\r\n',
    'NICK tertiary_\r\n',
  ]);
  assert.deepEqual(notices, [
    'primary is already in use. Retrying with secondary...',
    'secondary is already in use. Retrying with tertiary...',
    'tertiary is already in use. Retrying with tertiary_...',
  ]);
  assert.equal(connection.lifecycle.currentNick, 'tertiary_');
});
