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
      templateId: null,
      managerHidden: false,
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
      templateId: null,
      managerHidden: false,
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
      'PASS secret\r\n',
      'CAP LS 302\r\n',
      'NICK tester\r\n',
      'USER tester 0 * :Test User\r\n',
    ]);
  } finally {
    tls.connect = originalConnect;
    connection.disconnect();
  }
});

test('sasl plain connections negotiate capabilities before completing registration', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'SaslNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'ident',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'sasl-plain',
      authAccount: 'account',
      password: 'hunter2',
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event as Record<string, unknown>);
      },
    }
  );

  try {
    connection.connect();
    socket.emit('connect');

    assert.deepEqual(writes, [
      'CAP LS 302\r\n',
      'NICK tester\r\n',
      'USER ident 0 * :Test User\r\n',
    ]);

    handleIrcLine(connection, ':irc.example CAP * LS :multi-prefix sasl');
    assert.equal(writes.at(-1), 'CAP REQ :sasl\r\n');

    handleIrcLine(connection, ':irc.example CAP * ACK :sasl');
    assert.equal(writes.at(-1), 'AUTHENTICATE PLAIN\r\n');

    handleIrcLine(connection, ':irc.example AUTHENTICATE +');
    assert.equal(
      writes.at(-1),
      `AUTHENTICATE ${Buffer.from('\u0000account\u0000hunter2', 'utf8').toString('base64')}\r\n`
    );

    handleIrcLine(connection, ':irc.example 903 tester :SASL authentication successful');

    assert.equal(writes.at(-1), 'CAP END\r\n');
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.equal(
      events.some(
        (event) => event.type === 'status' && event.message === 'SASL authentication succeeded'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});

test('sasl plain connections complete negotiation on numeric 900 success', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'SaslNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'ident',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'sasl-plain',
      authAccount: 'account',
      password: 'hunter2',
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event as Record<string, unknown>);
      },
    }
  );

  try {
    connection.connect();
    socket.emit('connect');

    handleIrcLine(connection, ':irc.example CAP * LS :multi-prefix sasl');
    handleIrcLine(connection, ':irc.example CAP * ACK :sasl');
    handleIrcLine(connection, ':irc.example AUTHENTICATE +');
    handleIrcLine(connection, ':irc.example 900 tester account account!user@example :You are now logged in as account');

    assert.equal(writes.at(-1), 'CAP END\r\n');
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.equal(
      events.some(
        (event) => event.type === 'status' && event.message === 'You are now logged in as account'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});

test('numeric 900 releases deferred NickServ autojoin after identify', () => {
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'NickServNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'nickserv',
      authTarget: 'NickServ',
      password: 'hunter2',
      favorite: false,
      autoJoin: ['#chat'],
    },
    { onEvent() {} }
  );

  connection.lifecycle.socket = createMockSocket(writes) as any;

  handleIrcLine(connection, ':irc.example 001 tester_ :Welcome');

  assert.deepEqual(writes, ['PRIVMSG NickServ :IDENTIFY tester hunter2\r\n']);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, 'NickServ');

  handleIrcLine(connection, ':irc.example 900 tester_ tester tester!user@example :You are now logged in as tester');

  assert.deepEqual(writes, [
    'PRIVMSG NickServ :IDENTIFY tester hunter2\r\n',
    'JOIN #chat\r\n',
  ]);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, null);
});

test('nickserv identify success accepts configured service targets and notice star replies', () => {
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'NickServNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'tester',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'nickserv',
      authTarget: 'NickServ@services',
      password: 'hunter2',
      favorite: false,
      autoJoin: ['#chat'],
    },
    { onEvent() {} }
  );

  connection.lifecycle.socket = createMockSocket(writes) as any;

  handleIrcLine(connection, ':irc.example 001 tester :Welcome');

  assert.deepEqual(writes, ['PRIVMSG NickServ@services :IDENTIFY tester hunter2\r\n']);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, 'NickServ@services');

  handleIrcLine(connection, ':NickServ!service@services NOTICE * :You are now logged in as tester');

  assert.deepEqual(writes, [
    'PRIVMSG NickServ@services :IDENTIFY tester hunter2\r\n',
    'JOIN #chat\r\n',
  ]);
  assert.equal(connection.lifecycle.pendingNickservAutoJoinTarget, null);
});

test('sasl plain falls back cleanly when the server does not advertise sasl', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'SaslNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'ident',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'sasl-plain',
      authAccount: 'account',
      password: 'hunter2',
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        events.push(event as Record<string, unknown>);
      },
    }
  );

  try {
    connection.connect();
    socket.emit('connect');
    handleIrcLine(connection, ':irc.example CAP * LS :multi-prefix');

    assert.equal(writes.at(-1), 'CAP END\r\n');
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.equal(
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'error'
          && event.message === 'Server does not advertise SASL; continuing without it'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});

test('sasl plain aborts cleanly when the server welcomes before replying to CAP LS', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const events: Array<Record<string, unknown>> = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'SaslNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'tester',
      altNicks: ['tester_', 'tester__'],
      username: 'ident',
      realName: 'Test User',
      hasPassword: true,
      authMethod: 'sasl-plain',
      authAccount: 'account',
      password: 'hunter2',
      favorite: false,
      autoJoin: ['#chat'],
    },
    {
      onEvent: (event) => {
        events.push(event as Record<string, unknown>);
      },
    }
  );

  try {
    connection.connect();
    socket.emit('connect');
    handleIrcLine(connection, ':irc.example 001 tester :Welcome');

    assert.equal(connection.lifecycle.connected, true);
    assert.equal(connection.lifecycle.sasl.phase, 'completed');
    assert.deepEqual(writes, [
      'CAP LS 302\r\n',
      'NICK tester\r\n',
      'USER ident 0 * :Test User\r\n',
      'JOIN #chat\r\n',
    ]);
    assert.equal(
      events.some(
        (event) =>
          event.type === 'status'
          && event.kind === 'error'
          && event.message === 'Server completed registration before replying to CAP LS; continuing without negotiated capabilities'
      ),
      true
    );
  } finally {
    net.connect = originalConnect;
    connection.disconnect();
  }
});
