import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Runtime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';

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

const createHandshakeServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    hasConnections() {
      return sockets.size > 0;
    },
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

const createRegisteredServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let nick: string | null = null;
    let sawUser = false;
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line.startsWith('NICK ')) {
          nick = line.slice('NICK '.length).trim() || nick;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (nick && sawUser) {
          socket.write(`:irc.example 001 ${nick} :Welcome\r\n`);
          sawUser = false;
        }
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    hasConnections() {
      return sockets.size > 0;
    },
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

test('runtime uses updated network settings on reconnect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('runtime-user', 'secret');
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createHandshakeServer(firstReceived);
  const second = await createHandshakeServer(secondReceived);

  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: '127.0.0.1',
    port: first.port,
    tls: false,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'runtime-user',
    realName: 'runtime-user',
    favorite: false,
    autoJoin: [],
  });

  try {
    runtime.connect(user.id, network.id);
    await waitFor(() => firstReceived.some((line) => line === 'NICK oldnick'));

    runtime.disconnect(user.id, network.id);
    runtime.saveNetwork(user.id, {
      ...network,
      host: '127.0.0.1',
      port: second.port,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
    });

    runtime.connect(user.id, network.id);
    await waitFor(() => secondReceived.some((line) => line === 'NICK newnick'));
  } finally {
    runtime.disconnect(user.id, network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('saving a connected network reconnects the live session with updated settings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('runtime-live-user', 'secret');
  storage.createSession(user.id);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createRegisteredServer(firstReceived);
  const second = await createRegisteredServer(secondReceived);

  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: '127.0.0.1',
    port: first.port,
    tls: false,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'olduser',
    realName: 'Old User',
    favorite: false,
    autoJoin: [],
  });

  try {
    runtime.connect(user.id, network.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));
    await waitFor(() => firstReceived.includes('USER olduser 0 * :Old User'));

    runtime.saveNetwork(user.id, {
      ...network,
      host: '127.0.0.1',
      port: second.port,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
    });

    await waitFor(() => secondReceived.includes('NICK newnick'));
    await waitFor(() => secondReceived.includes('USER newuser 0 * :New User'));
    await waitFor(() => !first.hasConnections());
    assert.equal(storage.getNetwork(user.id, network.id)?.nick, 'newnick');
  } finally {
    runtime.disconnect(user.id, network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel events keep the untouched half of channel state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('channel-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  storage.upsertChannel(user.id, {
    networkId: network.id,
    name: '#help',
    topic: 'old topic',
    unread: 2,
    users: ['alice', 'bob'],
  });

  handleRuntimeEvent({ store: storage, send() {} }, user.id, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    topic: 'new topic',
  });
  assert.deepEqual(storage.getChannelByName(user.id, network.id, '#help'), {
    id: storage.getChannelByName(user.id, network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    unread: 2,
    users: ['alice', 'bob'],
  });

  handleRuntimeEvent({ store: storage, send() {} }, user.id, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    users: ['carol'],
  });
  assert.deepEqual(storage.getChannelByName(user.id, network.id, '#help'), {
    id: storage.getChannelByName(user.id, network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    unread: 2,
    users: ['carol'],
  });
});

test('runtime join preserves existing channel metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('join-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  const existing = storage.upsertChannel(user.id, {
    networkId: network.id,
    name: '#help',
    topic: 'saved topic',
    unread: 3,
    users: ['alice'],
  });

  runtime.join(user.id, network.id, '#help');

  assert.deepEqual(storage.getChannelByName(user.id, network.id, '#help'), existing);
});

test('runtime join rejects missing networks before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('missing-network-user', 'secret');

  assert.throws(() => runtime.join(user.id, 'missing-network', '#help'), /Network not found/);
  assert.equal(storage.listChannels(user.id).length, 0);
});

test('runtime part rejects missing networks before touching connections', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('missing-part-user', 'secret');

  assert.throws(() => runtime.part(user.id, 'missing-network', '#help'), /Network not found/);
});

test('runtime closeQuery rejects missing networks before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('missing-query-user', 'secret');

  assert.throws(() => runtime.closeQuery(user.id, 'missing-network', 'helper'), /Network not found/);
  assert.equal(storage.getQuery(user.id, 'missing-network', 'helper'), null);
});

test('runtime openQuery rejects invalid private-message targets before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('invalid-query-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => runtime.openQuery(user.id, network.id, '   '), /Private-message target is required/);
  assert.throws(() => runtime.openQuery(user.id, network.id, 'server'), /Private-message target is required/);
  assert.throws(() => runtime.openQuery(user.id, network.id, '#help'), /Private-message target is required/);
  assert.equal(storage.listQueries(user.id).length, 0);
});

test('runtime join rejects invalid channel names before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('invalid-join-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => runtime.join(user.id, network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.equal(storage.listChannels(user.id).length, 0);
});

test('runtime part rejects invalid channel names before touching connections', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('invalid-part-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => runtime.part(user.id, network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
});

test('runtime sendMessage rejects invalid private-message targets before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('invalid-send-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => runtime.sendMessage(user.id, network.id, '   ', 'hello'), /Private-message target is required/);
  assert.equal(storage.listQueries(user.id).length, 0);
  assert.equal(storage.listMessages(user.id, network.id, '   ', 10).length, 0);
});

test('runtime openQuery rejects whitespace-containing private-message targets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('spaced-query-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => runtime.openQuery(user.id, network.id, 'alice bob'), /Private-message target is required/);
  assert.equal(storage.listQueries(user.id).length, 0);
});

test('runtime sendMessage rejects multi-line bodies before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('multiline-send-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => runtime.sendMessage(user.id, network.id, '#help', 'hello\r\nOPER root'), /Message body cannot contain carriage returns or line feeds/);
  assert.equal(storage.listMessages(user.id, network.id, '#help', 10).length, 0);
});

test('runtime sendRaw rejects multi-line commands before touching the socket', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('multiline-raw-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  assert.throws(() => runtime.sendRaw(user.id, network.id, 'JOIN #help\r\nOPER root'), /Raw command cannot contain carriage returns or line feeds/);
  assert.equal(storage.listMessages(user.id, network.id, 'server', 10).length, 0);
});

test('runtime sendMessage does not persist unsent direct messages while disconnected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('offline-send-user', 'secret');
  storage.createSession(user.id);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });

  runtime.sendMessage(user.id, network.id, 'helper', 'hello');

  assert.equal(storage.listQueries(user.id).length, 0);
  assert.equal(storage.listMessages(user.id, network.id, 'helper', 10).length, 0);
  assert.equal(storage.listMessages(user.id, network.id, 'server', 10).at(-1)?.body, 'Not connected');
});

test('runtime markChannelRead rejects missing channels', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('missing-channel-user', 'secret');

  assert.throws(() => runtime.markChannelRead(user.id, 'missing-channel'), /Channel not found/);
});

test('deleteNetwork removes disconnected runtime connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('delete-user', 'secret');
  storage.createSession(user.id);
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'DeleteNet',
    host: '127.0.0.1',
    port: handshake.port,
    tls: false,
    nick: 'deleter',
    altNicks: ['deleter_', 'deleter__'],
    username: 'deleter',
    realName: 'deleter',
    favorite: false,
    autoJoin: [],
  });
  const connections = (runtime as unknown as { connections: Map<string, Map<string, unknown>> }).connections;

  try {
    runtime.connect(user.id, network.id);
    assert.equal(connections.get(user.id)?.has(network.id), true);

    runtime.deleteNetwork(user.id, network.id);

    assert.equal(connections.get(user.id)?.has(network.id) ?? false, false);
    assert.equal(connections.has(user.id), false);
    assert.equal(storage.getNetwork(user.id, network.id), null);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('revokeSession disconnects runtime connections when the last session is removed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('session-user', 'secret');
  const session = storage.createSession(user.id);
  const handshake = await createHandshakeServer([]);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'SessionNet',
    host: '127.0.0.1',
    port: handshake.port,
    tls: false,
    nick: 'session',
    altNicks: ['session_', 'session__'],
    username: 'session',
    realName: 'session',
    favorite: false,
    autoJoin: [],
  });
  const connections = (runtime as unknown as { connections: Map<string, Map<string, unknown>> }).connections;

  try {
    runtime.connect(user.id, network.id);
    await waitFor(() => handshake.hasConnections());

    storage.deleteSession(session.token);
    runtime.revokeSession(session.token, user.id);

    await waitFor(() => !handshake.hasConnections());
    assert.equal(connections.has(user.id), false);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('revokeSession keeps runtime connections alive while another session remains', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('multi-session-user', 'secret');
  const firstSession = storage.createSession(user.id);
  const secondSession = storage.createSession(user.id);
  const handshake = await createHandshakeServer([]);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'MultiSessionNet',
    host: '127.0.0.1',
    port: handshake.port,
    tls: false,
    nick: 'session',
    altNicks: ['session_', 'session__'],
    username: 'session',
    realName: 'session',
    favorite: false,
    autoJoin: [],
  });
  const connections = (runtime as unknown as { connections: Map<string, Map<string, unknown>> }).connections;

  try {
    runtime.connect(user.id, network.id);
    await waitFor(() => handshake.hasConnections());

    storage.deleteSession(firstSession.token);
    runtime.revokeSession(firstSession.token, user.id);

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(handshake.hasConnections(), true);
    assert.equal(connections.get(user.id)?.has(network.id), true);

    storage.deleteSession(secondSession.token);
    runtime.revokeSession(secondSession.token, user.id);

    await waitFor(() => !handshake.hasConnections());
    assert.equal(connections.has(user.id), false);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime connect rejects stale session tokens before opening a new connection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('stale-connect-user', 'secret');
  const session = storage.createSession(user.id);
  const handshake = await createHandshakeServer([]);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'StaleConnectNet',
    host: '127.0.0.1',
    port: handshake.port,
    tls: false,
    nick: 'stale',
    altNicks: ['stale_', 'stale__'],
    username: 'stale',
    realName: 'stale',
    favorite: false,
    autoJoin: [],
  });

  try {
    storage.deleteSession(session.token);

    assert.throws(() => runtime.connect(user.id, network.id, session.token), /Authentication required/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(handshake.hasConnections(), false);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime close disconnects active connections and clears session timers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('close-user', 'secret');
  const session = storage.createSession(user.id);
  const handshake = await createHandshakeServer([]);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'CloseNet',
    host: '127.0.0.1',
    port: handshake.port,
    tls: false,
    nick: 'close',
    altNicks: ['close_', 'close__'],
    username: 'close',
    realName: 'close',
    favorite: false,
    autoJoin: [],
  });
  const state = runtime as unknown as {
    connections: Map<string, Map<string, unknown>>;
    sessionExpiryTimers: Map<string, ReturnType<typeof setTimeout>>;
  };

  try {
    runtime.connect(user.id, network.id, session.token);
    await waitFor(() => handshake.hasConnections());

    assert.equal(state.connections.get(user.id)?.has(network.id), true);
    assert.equal(state.sessionExpiryTimers.size, 1);

    runtime.close();

    await waitFor(() => !handshake.hasConnections());
    assert.equal(state.connections.size, 0);
    assert.equal(state.sessionExpiryTimers.size, 0);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('session expiry disconnects idle runtime connections without waiting for activity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const file = join(dir, 'db.sqlite');
  const storage = new Storage(file);
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('expiring-user', 'secret');
  const expiresAt = Date.now() + 150;
  const db = new DatabaseSync(file);
  db.prepare('INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
    .run('soon-expiring', user.id, Date.now(), expiresAt);
  db.close();
  const handshake = await createHandshakeServer([]);
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'ExpiringNet',
    host: '127.0.0.1',
    port: handshake.port,
    tls: false,
    nick: 'expiring',
    altNicks: ['expiring_', 'expiring__'],
    username: 'expiring',
    realName: 'expiring',
    favorite: false,
    autoJoin: [],
  });
  const connections = (runtime as unknown as { connections: Map<string, Map<string, unknown>> }).connections;

  try {
    runtime.connect(user.id, network.id);
    await waitFor(() => handshake.hasConnections());

    await waitFor(() => !handshake.hasConnections(), 3000);
    assert.equal(connections.has(user.id), false);
    assert.equal(storage.hasActiveSessions(user.id), false);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('deleteNetwork removes hidden clone connections when deleting a template', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const user = storage.bootstrapUser('delete-template-user', 'secret');
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const template = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TemplateNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'template',
    altNicks: ['template_', 'template__'],
    username: 'template',
    realName: 'template',
    favorite: false,
    autoJoin: [],
  });
  const clone = storage.upsertNetwork(user.id, {
    ...template,
    id: undefined,
    templateId: template.id,
    managerHidden: true,
    host: '127.0.0.1',
    port: handshake.port,
  });
  const connections = (runtime as unknown as { connections: Map<string, Map<string, unknown>> }).connections;
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    runtime.connect(user.id, clone.id);
    await waitFor(() => received.some((line) => line === 'NICK template'));

    runtime.deleteNetwork(user.id, template.id);
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(storage.getNetwork(user.id, template.id), null);
    assert.equal(storage.getNetwork(user.id, clone.id), null);
    assert.equal(connections.get(user.id)?.has(clone.id) ?? false, false);
    assert.equal(uncaught, null);
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('self part events remove the channel and emit channel.remove', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('part-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });
  const channel = storage.upsertChannel(user.id, {
    networkId: network.id,
    name: '#help',
    topic: 'support',
    unread: 0,
    users: ['tester', 'alice'],
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(_userId, message) { sent.push(message); } },
    user.id,
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: '#help',
        nick: 'tester',
        body: 'tester left #help (Leaving)',
        kind: 'part',
        self: true,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.getChannelByName(user.id, network.id, '#help'), null);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(
    sent.find((message) => message.type === 'channel.remove'),
    {
      type: 'channel.remove',
      networkId: network.id,
      channelId: channel.id,
      channel: '#help',
    }
  );
});

test('incoming private messages open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const user = storage.bootstrapUser('query-buffer-user', 'secret');
  const network = storage.upsertNetwork(user.id, {
    templateId: null,
    managerHidden: false,
    name: 'TestNet',
    host: 'irc.example.test',
    port: 6667,
    tls: false,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'tester',
    favorite: false,
    autoJoin: [],
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(_userId, message) { sent.push(message); } },
    user.id,
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'helper',
        nick: 'helper',
        body: 'hello there',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.getQuery(user.id, network.id, 'helper')?.target, 'helper');
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(
    sent.find((message) => message.type === 'query.open'),
    {
      type: 'query.open',
      query: storage.getQuery(user.id, network.id, 'helper'),
    }
  );
});
