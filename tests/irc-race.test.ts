import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { handleIrcLine } from '../server/irc-handle-line.js';
import type { ChannelUserState } from '../shared/protocol.js';

const makeUser = (nick: string, mode: ChannelUserState['mode'] = 'normal'): ChannelUserState => ({
  nick,
  mode,
});

const waitFor = async (predicate: () => boolean, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for condition');
};

const createMockSocket = (writes: string[]) => {
  class MockSocket extends EventEmitter {
    destroyed = false;

    write(line: string) {
      writes.push(line);
      return true;
    }

    end() {}
    setEncoding() {}
    destroy() {
      this.destroyed = true;
      this.emit('close');
      return this;
    }
  }

  return new MockSocket();
};

const createWelcomeServer = async (closeDelayMs = 0) => {
  let activeSocket: net.Socket | null = null;
  let closeRequested = false;
  let resolveCloseFinished!: () => void;
  const closeFinished = new Promise<void>((resolve) => {
    resolveCloseFinished = resolve;
  });
  const server = net.createServer((socket) => {
    activeSocket = socket;
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (line.startsWith('NICK ')) {
          sawNick = true;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (line.startsWith('QUIT ')) {
          closeRequested = true;
        }
        if (sawNick && sawUser) {
          socket.write(':irc.example 001 tester :Welcome\r\n');
          sawNick = false;
          sawUser = false;
        }
        index = buffer.indexOf('\n');
      }
    });
    socket.on('end', () => {
      setTimeout(() => {
        socket.end();
        resolveCloseFinished();
      }, closeDelayMs);
    });
    socket.on('close', () => {
      if (!closeRequested) {
        resolveCloseFinished();
      }
      activeSocket = null;
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    closeFinished,
    destroySocket() {
      activeSocket?.destroy();
    },
  };
};

test('late close from an old socket does not disconnect the new connection', async () => {
  const first = await createWelcomeServer(150);
  const second = await createWelcomeServer();
  const stateEvents: boolean[] = [];
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
          stateEvents.push(event.connected);
        }
      },
    }
  );

  try {
    connection.connect();
    await waitFor(() => connection.connected);

    connection.disconnect();
    const disconnectStates = stateEvents.filter((connected) => connected === false).length;
    connection.updateProfile({ ...connection.profile, port: second.port });
    connection.connect();

    await waitFor(() => connection.connected && connection.socket !== null);
    await first.closeFinished;
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(connection.connected, true);
    assert.equal(stateEvents.at(-1), true);
    assert.equal(stateEvents.filter((connected) => connected === false).length, disconnectStates);
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
      'NICK tester\r\n',
      'USER tester 0 * :Test User\r\n',
    ]);
  } finally {
    tls.connect = originalConnect;
    connection.disconnect();
  }
});

test('reconnect timers are unrefd and cleared on manual disconnect', () => {
  const originalConnect = net.connect;
  const socket = createMockSocket([]);
  net.connect = (() => socket as unknown as net.Socket) as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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

    assert.notEqual(connection.reconnectTimer, null);
    assert.equal(connection.reconnectTimer?.hasRef?.(), false);

    connection.disconnect();

    assert.equal(connection.reconnectTimer, null);
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
      templateId: null,
      managerHidden: false,
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
      templateId: null,
      managerHidden: false,
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

  connection.connected = true;
  connection.socket = createMockSocket() as any;
  connection.updateProfile({ ...connection.profile, nick: 'newnick', altNicks: ['newnick_', 'newnick__'] });
  connection.disconnect();
  connection.socket = createMockSocket() as any;

  handleIrcLine(connection, ':irc.example 433 * newnick :Nickname is already in use');

  assert.equal(connection.currentNick, 'newnick_');
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
      templateId: null,
      managerHidden: false,
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

  connection.socket = socket as any;
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
  assert.equal(connection.currentNick, 'tertiary_');
});

test('connected nick changes wait for server confirmation before mutating current nick', () => {
  const writes: string[] = [];
  const states: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('newnick');

  assert.equal(connection.currentNick, 'tester');
  assert.equal(connection.pendingNick, 'newnick');
  assert.deepEqual(states, []);
  assert.deepEqual(writes, ['NICK newnick\r\n']);

  handleIrcLine(connection, ':tester!user@host NICK newnick');

  assert.equal(connection.currentNick, 'newnick');
  assert.equal(connection.pendingNick, null);
  assert.deepEqual(states, ['newnick']);
});

test('rejected connected nick changes keep the last accepted nick', () => {
  const writes: string[] = [];
  const statuses: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
        if (event.type === 'status' && event.kind === 'error') {
          statuses.push(event.message);
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('newnick');
  handleIrcLine(connection, ':irc.example 437 tester newnick :Nickname temporarily unavailable');

  assert.equal(connection.currentNick, 'tester');
  assert.equal(connection.pendingNick, null);
  assert.deepEqual(writes, ['NICK newnick\r\n']);
  assert.deepEqual(statuses, ['newnick was rejected by the server']);
});

test('queued connected nick changes keep the accepted nick after a later rejection', () => {
  const writes: string[] = [];
  const states: string[] = [];
  const notices: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
        if (event.type === 'status' && event.kind === 'notice') {
          notices.push(event.message);
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('new1', '#chat');
  connection.setNick('new2', '#chat');

  handleIrcLine(connection, ':tester!user@host NICK new1');
  handleIrcLine(connection, ':irc.example 433 tester new2 :Nickname is already in use');

  assert.equal(connection.currentNick, 'new1');
  assert.equal(connection.pendingNick, 'new2_');
  assert.deepEqual(states, ['new1']);
  assert.deepEqual(writes, [
    'NICK new1\r\n',
    'NICK new2\r\n',
    'NICK new2_\r\n',
  ]);
  assert.deepEqual(notices, ['new2 is already in use. Retrying with new2_...']);
});

test('duplicate connected nick requests are fully retired after a successful self nick change', () => {
  const writes: string[] = [];
  const states: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('newnick', '#first');
  connection.setNick('newnick', '#second');

  handleIrcLine(connection, ':tester!user@host NICK newnick');
  handleIrcLine(connection, ':irc.example 433 tester newnick :Nickname is already in use');

  assert.equal(connection.currentNick, 'newnick');
  assert.equal(connection.pendingNick, null);
  assert.deepEqual(states, ['newnick']);
  assert.deepEqual(writes, [
    'NICK newnick\r\n',
    'NICK newnick\r\n',
  ]);
});

test('queued connected nick rejections keep the rejected nick bound to its original request', () => {
  const writes: string[] = [];
  const statuses: Array<{ message: string; target?: string }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
        if (event.type === 'status' && event.kind === 'error') {
          statuses.push({ message: event.message, target: event.target });
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('bad?', '#first');
  connection.setNick('new2', '#second');

  handleIrcLine(connection, ':irc.example 432 tester bad? :Erroneous nickname');

  assert.equal(connection.currentNick, 'tester');
  assert.equal(connection.pendingNick, 'new2');
  assert.deepEqual(writes, [
    'NICK bad?\r\n',
    'NICK new2\r\n',
  ]);
  assert.deepEqual(statuses, [
    { message: 'bad? was rejected by the server', target: '#first' },
  ]);
});

test('duplicate rejected nick requests do not leave stale pending nick state behind', () => {
  const writes: string[] = [];
  const states: string[] = [];
  const statuses: Array<{ message: string; target?: string }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
        if (event.type === 'state') {
          states.push(event.nick);
        }
        if (event.type === 'status' && event.kind === 'error') {
          statuses.push({ message: event.message, target: event.target });
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('bad?', '#first');
  connection.setNick('bad?', '#second');

  handleIrcLine(connection, ':irc.example 432 tester bad? :Erroneous nickname');
  connection.setNick('good', '#third');
  handleIrcLine(connection, ':tester!user@host NICK good');

  assert.equal(connection.currentNick, 'good');
  assert.equal(connection.pendingNick, null);
  assert.deepEqual(states, ['good']);
  assert.deepEqual(writes, [
    'NICK bad?\r\n',
    'NICK bad?\r\n',
    'NICK good\r\n',
  ]);
  assert.deepEqual(statuses.map((status) => status.message), ['bad? was rejected by the server']);
});

test('older nick conflicts do not overwrite a newer pending nick request', () => {
  const writes: string[] = [];
  const notices: Array<{ message: string; target?: string }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
        if (event.type === 'status' && event.kind === 'notice') {
          notices.push({ message: event.message, target: event.target });
        }
      },
    }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.setNick('new1', '#first');
  connection.setNick('new2', '#second');

  handleIrcLine(connection, ':irc.example 433 tester new1 :Nickname is already in use');

  assert.equal(connection.currentNick, 'tester');
  assert.equal(connection.pendingNick, 'new2');
  assert.deepEqual(writes, [
    'NICK new1\r\n',
    'NICK new2\r\n',
  ]);
  assert.deepEqual(notices, [
    { message: 'new1 is already in use. Keeping new2 as the pending nick.', target: '#first' },
  ]);
});

test('profile updates retry a rejected connected nick change when the desired nick is still different', () => {
  const writes: string[] = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
    { onEvent() {} }
  );

  connection.connected = true;
  connection.socket = createMockSocket(writes) as any;
  connection.updateProfile({ ...connection.profile, nick: 'newnick', altNicks: ['newnick_', 'newnick__'] });
  handleIrcLine(connection, ':irc.example 437 tester newnick :Nickname temporarily unavailable');
  connection.updateProfile({ ...connection.profile, favorite: true });

  assert.equal(connection.currentNick, 'tester');
  assert.equal(connection.pendingNick, 'newnick');
  assert.deepEqual(writes, [
    'NICK newnick\r\n',
    'NICK newnick\r\n',
  ]);
});

test('updating a profile while connecting restarts the handshake with the new settings', () => {
  const originalConnect = net.connect;
  const firstWrites: string[] = [];
  const secondWrites: string[] = [];
  const sockets = [createMockSocket(firstWrites), createMockSocket(secondWrites)];
  const statuses: string[] = [];
  let connectCalls = 0;
  net.connect = (() => sockets[connectCalls++]) as unknown as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'OldNet',
      host: 'old.example.test',
      port: 6667,
      tls: false,
      nick: 'oldnick',
      altNicks: ['oldnick_', 'oldnick__'],
      username: 'olduser',
      realName: 'Old User',
      hasPassword: true,
      password: 'oldpass',
      favorite: false,
      autoJoin: [],
    },
    {
      onEvent: (event) => {
        if (event.type === 'status') {
          statuses.push(event.message);
        }
      },
    }
  );

  try {
    connection.connect();
    connection.buffer = ':irc.example 001 oldnick';
    connection.channelUsers.set('#help', [makeUser('alice')]);
    connection.updateProfile({
      ...connection.profile,
      name: 'NewNet',
      host: 'new.example.test',
      port: 6697,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
      hasPassword: true,
      password: 'newpass',
    });

    assert.equal(connectCalls, 2);
    assert.equal(sockets[0].destroyed, true);
    assert.equal(connection.buffer, '');
    assert.equal(connection.channelUsers.size, 0);

    sockets[0].emit('lookup', null, '127.0.0.1', 4, 'old.example.test');
    sockets[0].emit('connect');
    assert.deepEqual(firstWrites, []);

    sockets[1].emit('lookup', null, '127.0.0.1', 4, 'new.example.test');
    sockets[1].emit('connect');

    assert.deepEqual(secondWrites, [
      'PASS newpass\r\n',
      'NICK newnick\r\n',
      'USER newuser 0 * :New User\r\n',
    ]);
    assert.ok(statuses.includes('Looking up old.example.test'));
    assert.ok(statuses.includes('Looking up new.example.test'));
    assert.ok(statuses.includes('Connecting to new.example.test (127.0.0.1:6697)'));
  } finally {
    net.connect = originalConnect;
  }
});

test('updating login fields during handshake restarts even on the same server', () => {
  const originalConnect = net.connect;
  const firstWrites: string[] = [];
  const secondWrites: string[] = [];
  const sockets = [createMockSocket(firstWrites), createMockSocket(secondWrites)];
  let connectCalls = 0;
  net.connect = (() => sockets[connectCalls++]) as unknown as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'oldnick',
      altNicks: ['oldnick_', 'oldnick__'],
      username: 'olduser',
      realName: 'Old User',
      hasPassword: true,
      password: 'oldpass',
      favorite: false,
      autoJoin: [],
    },
    { onEvent() {} }
  );

  try {
    connection.connect();
    sockets[0].emit('connect');

    assert.deepEqual(firstWrites, [
      'PASS oldpass\r\n',
      'NICK oldnick\r\n',
      'USER olduser 0 * :Old User\r\n',
    ]);

    connection.updateProfile({
      ...connection.profile,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
      password: 'newpass',
    });

    assert.equal(connectCalls, 2);
    assert.equal(sockets[0].destroyed, true);

    sockets[1].emit('connect');

    assert.deepEqual(secondWrites, [
      'PASS newpass\r\n',
      'NICK newnick\r\n',
      'USER newuser 0 * :New User\r\n',
    ]);
  } finally {
    net.connect = originalConnect;
  }
});

test('multi-line names replies accumulate users across repeated 353 numerics', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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

  connection.channelUsers.set('#help', []);
  handleIrcLine(connection, ':irc.example 353 tester = #help :@alice +bob');
  handleIrcLine(connection, ':irc.example 353 tester = #help :carol dave');

  assert.deepEqual(connection.channelUsers.get('#help') ?? [], [
    makeUser('alice', 'op'),
    makeUser('bob', 'voice'),
    makeUser('carol'),
    makeUser('dave'),
  ]);
  assert.deepEqual(
    (events.filter((event) => event.type === 'channel').at(-1) as { users: ChannelUserState[] } | undefined)?.users,
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
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'irc.example.test',
      port: 6667,
      tls: false,
      nick: 'Tester',
      altNicks: ['Tester_', 'Tester__'],
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

  handleIrcLine(connection, ':tester!user@host JOIN #Help');
  handleIrcLine(connection, ':other!user@host PRIVMSG #help :hello there');
  handleIrcLine(connection, ':HELPER!user@host JOIN #help');
  handleIrcLine(connection, ':helper!user@host NICK Helper');
  handleIrcLine(connection, ':HELPER!user@host QUIT :bye');

  assert.deepEqual(Array.from(connection.channelUsers.keys()), ['#Help']);
  assert.deepEqual(connection.channelUsers.get('#Help') ?? [], [makeUser('tester')]);

  const messageEvents = events.filter(
    (event): event is { type: 'message'; message: Record<string, unknown> } => event.type === 'message'
  );
  assert.equal(messageEvents[0]?.message.target, '#Help');
  assert.equal(messageEvents[0]?.message.self, true);
  assert.equal(messageEvents[1]?.message.target, '#Help');
  assert.equal(messageEvents[1]?.message.body, 'hello there');
});

test('channel mode changes update nick privileges in the user list', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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

  connection.channelUsers.set('#help', [makeUser('alice'), makeUser('bob', 'voice')]);
  handleIrcLine(connection, ':chanop!user@host MODE #help +o-v alice bob');

  assert.deepEqual(connection.channelUsers.get('#help') ?? [], [
    makeUser('alice', 'op'),
    makeUser('bob'),
  ]);
  assert.deepEqual(
    (events.filter((event) => event.type === 'channel').at(-1) as { users: ChannelUserState[] } | undefined)?.users,
    [
      makeUser('alice', 'op'),
      makeUser('bob'),
    ]
  );
});

test('channel mode changes preserve user updates when channel modes are mixed in', () => {
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
      onEvent: () => {},
    }
  );

  connection.channelUsers.set('#help', [makeUser('alice', 'op')]);
  handleIrcLine(connection, ':chanop!user@host MODE #help +nt-o alice');

  assert.deepEqual(connection.channelUsers.get('#help') ?? [], [makeUser('alice')]);
});

test('channel mode changes keep user updates aligned after unknown arg-taking modes', () => {
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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
      onEvent: () => {},
    }
  );

  connection.channelUsers.set('#help', [makeUser('alice')]);
  handleIrcLine(connection, ':chanop!user@host MODE #help +Lo #overflow alice');

  assert.deepEqual(connection.channelUsers.get('#help') ?? [], [makeUser('alice', 'op')]);
});

test('self kicks emit a self part message and remove channel membership', () => {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
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

  connection.channelUsers.set('#help', [makeUser('tester'), makeUser('alice')]);
  handleIrcLine(connection, ':op!user@host KICK #help tester :bye');

  assert.equal(connection.channelUsers.has('#help'), false);
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
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
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

  connection.channelUsers.set('#help', [makeUser('tester'), makeUser('alice')]);

  handleIrcLine(connection, ':tester!user@host PART #help :Leaving');

  assert.equal(connection.channelUsers.has('#help'), false);
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
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: '127.0.0.1',
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

  connection.channelUsers.set('#help', [makeUser('tester'), makeUser('alice')]);
  handleIrcLine(connection, ':tester!user@host PART #help :Leaving');
  const afterPartEvents = events.length;

  handleIrcLine(connection, ':alice!user@host JOIN #help');
  handleIrcLine(connection, ':alice!user@host PART #help :Later');
  handleIrcLine(connection, ':alice!user@host PRIVMSG #help :stale line');
  handleIrcLine(connection, ':alice!user@host TOPIC #help :Topic line');
  handleIrcLine(connection, ':irc.example 332 tester #help :Topic line');
  handleIrcLine(connection, ':irc.example 353 tester = #help :@tester +alice');

  assert.equal(connection.channelUsers.has('#help'), false);
  assert.deepEqual(
    events.slice(afterPartEvents).filter((event) => event.type === 'channel' || event.type === 'message'),
    []
  );
});

test('socket close clears parser buffers and nick tracking', () => {
  const originalConnect = net.connect;
  const writes: string[] = [];
  const socket = createMockSocket(writes);
  net.connect = (() => socket) as unknown as typeof net.connect;

  const connection = new IrcConnection(
    {
      id: randomUUID(),
      templateId: null,
      managerHidden: false,
      name: 'TestNet',
      host: 'close.example.test',
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
    connection.buffer = ':irc.example 001 tester';
    connection.channelUsers.set('#help', [makeUser('alice')]);
    connection.manualDisconnect = true;

    socket.emit('close');

    assert.equal(connection.buffer, '');
    assert.equal(connection.channelUsers.size, 0);
  } finally {
    net.connect = originalConnect;
  }
});
