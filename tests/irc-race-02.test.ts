import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket, mockNetConnect } from './helpers/irc-race-test-helpers.js';

test('reconnect timers are unrefd and cleared on manual disconnect', () => {
  const socket = createMockSocket([]);
  const restoreConnect = mockNetConnect(socket);

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
    restoreConnect();
  }
});

test('manual reconnect resets the exhausted retry budget', () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduled: Array<{ callback: () => void; delay: number; cancelled: boolean }> = [];
  const timerEntries = new Map<ReturnType<typeof setTimeout>, typeof scheduled[number]>();
  const sockets = Array.from({ length: 5 }, () => createMockSocket([]));
  let connectCalls = 0;
  const restoreConnect = mockNetConnect(() => sockets[connectCalls++] ?? assert.fail('Unexpected reconnect'));
  global.setTimeout = (((callback: () => void, delay?: number) => {
    const entry = {
      callback,
      delay: Number(delay ?? 0),
      cancelled: false,
    };
    scheduled.push(entry);
    const handle = originalSetTimeout(() => {}, 60_000);
    handle.unref?.();
    timerEntries.set(handle, entry);
    return handle;
  }) as typeof setTimeout);
  global.clearTimeout = (((handle?: ReturnType<typeof setTimeout>) => {
    const entry = handle ? timerEntries.get(handle) : undefined;
    if (entry) {
      entry.cancelled = true;
    }
    if (handle) {
      timerEntries.delete(handle);
      originalClearTimeout(handle);
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
    restoreConnect();
    for (const handle of timerEntries.keys()) {
      originalClearTimeout(handle);
    }
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('nick fallback uses the updated profile nick after reconnecting', () => {
  const writes: string[] = [];
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
      realName: 'Test User',
      hasPassword: false,
      favorite: false,
      autoJoin: [],
    },
    { onEvent() {} }
  );

  connection.lifecycle.connected = true;
  attachMockSocket(connection, createMockSocket(writes));
  connection.updateProfile({ ...connection.profile, nick: 'newnick', altNicks: ['newnick_', 'newnick__'] });
  connection.disconnect();
  attachMockSocket(connection, createMockSocket(writes));

  handleIrcLine(connection, ':irc.example 433 * newnick :Nickname is already in use');

  assert.equal(connection.lifecycle.currentNick, 'newnick_');
  assert.ok(writes.includes('NICK newnick_\r\n'));
});

test('nick conflicts use configured alternate nicknames before suffix fallback', () => {
  const writes: string[] = [];
  const socket = createMockSocket(writes);
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

  attachMockSocket(connection, socket);
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
