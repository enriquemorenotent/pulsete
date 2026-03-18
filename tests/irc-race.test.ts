import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { handleIrcLine } from '../server/irc-handle-line.js';

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
    connection.channelUsers.set('#help', new Set(['alice']));
    connection.updateProfile({
      ...connection.profile,
      name: 'NewNet',
      host: 'new.example.test',
      port: 6697,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
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
      favorite: false,
      autoJoin: [],
    },
    { onEvent() {} }
  );

  try {
    connection.connect();
    connection.buffer = ':irc.example 001 tester';
    connection.channelUsers.set('#help', new Set(['alice']));
    connection.manualDisconnect = true;

    socket.emit('close');

    assert.equal(connection.buffer, '');
    assert.equal(connection.channelUsers.size, 0);
  } finally {
    net.connect = originalConnect;
  }
});
