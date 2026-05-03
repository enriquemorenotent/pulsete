import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import tls from 'node:tls';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { parseLine } from '../server/irc-parser.js';
import { IrcConnection } from '../server/irc.js';
import { createConnection,createMockSocket,createWelcomeServer,waitFor } from './helpers/irc-race-test-helpers.js';

test('parseLine skips repeated spaces between IRC parameters', () => {
  assert.deepEqual(parseLine('PING  :abc def'), {
    tags: {},
    prefix: null,
    command: 'PING',
    params: ['abc def'],
  });
  assert.deepEqual(parseLine(':irc.example 353 tester = #help  :@alice +bob'), {
    tags: {},
    prefix: 'irc.example',
    command: '353',
    params: ['tester', '=', '#help', '@alice +bob'],
  });
});

test('parseLine extracts IRCv3 tags before the prefix and command', () => {
  assert.deepEqual(
    parseLine('@time=2026-03-28T12:00:00.000Z;label=abc123 :alice!user@example PRIVMSG #chat :hello'),
    {
      tags: {
        time: '2026-03-28T12:00:00.000Z',
        label: 'abc123',
      },
      prefix: 'alice!user@example',
      command: 'PRIVMSG',
      params: ['#chat', 'hello'],
    },
  );
});

test('PING replies preserve the original parameter framing', () => {
  const writes: string[] = [];
  const connection = createConnection();
  connection.lifecycle.socket = createMockSocket(writes) as any;

  handleIrcLine(connection, 'PING  :abc def');

  assert.deepEqual(writes, ['PONG  :abc def\r\n']);
});

test('sendRaw degrades synchronous socket write failures into status events', () => {
  const events: Array<Record<string, unknown>> = [];

  class ThrowingSocket extends EventEmitter {
    destroyed = false;

    write() {
      throw new Error('boom');
    }

    end() {}
    setEncoding() {}
    destroy() {
      this.destroyed = true;
      return this;
    }
  }

  const connection = createConnection((event) => {
    events.push(event as Record<string, unknown>);
  });
  const socket = new ThrowingSocket();
  connection.lifecycle.socket = socket as any;

  const sent = connection.sendRaw('PING :test', '#status');

  assert.equal(sent, false);
  assert.equal(socket.destroyed, true);
  assert.equal(
    events.some(
      (event) =>
        event.type === 'status'
        && event.kind === 'error'
        && event.message === 'Connection is no longer writable'
        && event.target === '#status'
    ),
    true
  );
});

test('login write failures keep the write error instead of being relabeled as a line-limit error', () => {
  const originalConnect = net.connect;
  const events: Array<Record<string, unknown>> = [];

  class ThrowingConnectSocket extends EventEmitter {
    destroyed = false;

    write() {
      throw new Error('boom');
    }

    end() {}
    setEncoding() {}
    destroy() {
      this.destroyed = true;
      return this;
    }
  }

  const socket = new ThrowingConnectSocket();
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = createConnection((event) => {
    events.push(event as Record<string, unknown>);
  });

  try {
    connection.connect();
    socket.emit('connect');

    assert.equal(connection.lifecycle.lastFailureMessage, 'Connection is no longer writable');
    assert.equal(
      events.some(
        (event) =>
          event.type === 'status'
          && event.message === 'Unable to connect to 127.0.0.1:6667 (Login command exceeded the IRC line limit)'
      ),
      false
    );
  } finally {
    connection.clearConnectDeadlineTimer();
    connection.clearReconnectTimer();
    connection.lifecycle.socket = null;
    net.connect = originalConnect;
  }
});

test('late close from an old socket does not disconnect the new connection', async () => {
  const first = await createWelcomeServer(150);
  const second = await createWelcomeServer();
  const stateEvents: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TestNet',
      host: '127.0.0.1',
      port: first.port,
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
          stateEvents.push(event.phase);
        }
      },
    }
  );

  try {
    connection.connect();
    await waitFor(() => connection.lifecycle.connected);

    connection.disconnect();
    const disconnectStates = stateEvents.filter((phase) => phase === 'offline').length;
    connection.updateProfile({ ...connection.profile, port: second.port });
    connection.connect();

    await waitFor(() => connection.lifecycle.connected && connection.lifecycle.socket !== null);
    await first.closeFinished;
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(connection.lifecycle.connected, true);
    assert.equal(stateEvents.at(-1), 'connected');
    assert.equal(stateEvents.filter((phase) => phase === 'offline').length, disconnectStates);
  } finally {
    connection.disconnect();
    first.destroySocket();
    second.destroySocket();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('tls connections wait for secureConnect before sending credentials', () => {
  const originalConnect = tls.connect;
  const writes: string[] = [];
  const socket = Object.assign(createMockSocket(writes), {
    authorized: false,
  });
  tls.connect = (() => socket as unknown as tls.TLSSocket) as typeof tls.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      workspaceOpen: false,
      name: 'TlsNet',
      host: 'tls.example.test',
      port: 6697,
      tls: true,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: true,
      password: 'secret',
      favorite: false,
      autoJoin: [],
    },
    { onEvent() {} }
  );

  try {
    connection.connect();
    socket.emit('connect');
    assert.deepEqual(writes, []);

    socket.emit('secureConnect');

    assert.deepEqual(writes, [
      'PASS :secret\r\n',
      'CAP LS 302\r\n',
      'NICK tester\r\n',
      'USER tester 0 * :Test User\r\n',
    ]);
  } finally {
    tls.connect = originalConnect;
    connection.disconnect();
  }
});
