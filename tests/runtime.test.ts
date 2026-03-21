import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Runtime } from '../server/runtime.js';
import { Storage, type NetworkInput } from '../server/storage.js';
import type { ChannelListEntry, ChannelUserState, ServerMessage } from '../shared/protocol.js';

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

const createSocketRecorder = () => {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    sent: ServerMessage[];
    send(payload: string): void;
    close(): void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.sent = [];
  socket.send = (payload: string) => {
    socket.sent.push(JSON.parse(payload) as ServerMessage);
  };
  socket.close = () => {
    socket.readyState = WebSocket.CLOSED;
    socket.emit('close');
  };
  return socket as unknown as WebSocket & { sent: ServerMessage[]; close(): void };
};

const createThrowingSocket = () => {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    closed: boolean;
    send(payload: string): void;
    close(): void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.closed = false;
  socket.send = () => {
    throw new Error('boom');
  };
  socket.close = () => {
    socket.closed = true;
    socket.readyState = WebSocket.CLOSED;
    socket.emit('close');
  };
  return socket as unknown as WebSocket & { closed: boolean };
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

const createListServer = async (received: string[]) => {
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
        if (line === 'LIST' && nick) {
          socket.write(`:irc.example 321 ${nick} Channel :Users Name\r\n`);
          socket.write(`:irc.example 322 ${nick} #help 42 :Support room\r\n`);
          socket.write(`:irc.example 322 ${nick} #ops 7 :Operators\r\n`);
          socket.write(`:irc.example 323 ${nick} :End of /LIST\r\n`);
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
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

const createStreamingListServer = async (received: string[], trailingDelayMs = 100) => {
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
        if (line === 'LIST' && nick) {
          socket.write(`:irc.example 321 ${nick} Channel :Users Name\r\n`);
          socket.write(`:irc.example 322 ${nick} #help 42 :Support room\r\n`);
          setTimeout(() => {
            if (socket.destroyed) {
              return;
            }
            socket.write(`:irc.example 322 ${nick} #ops 7 :Operators\r\n`);
            socket.write(`:irc.example 323 ${nick} :End of /LIST\r\n`);
          }, trailingDelayMs).unref?.();
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
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

const createIsonServer = async (received: string[], onlineNicks: string[]) => {
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
        if (line.startsWith('ISON ') && nick) {
          const tracked = line
            .slice('ISON '.length)
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          const visible = tracked.filter((candidate) => onlineNicks.includes(candidate));
          socket.write(`:irc.example 303 ${nick} :${visible.join(' ')}\r\n`);
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
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

const createNetworkInput = (overrides: Partial<NetworkInput> = {}): NetworkInput => ({
  templateId: null,
  managerHidden: false,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

test('runtime uses updated network settings on reconnect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createHandshakeServer(firstReceived);
  const second = await createHandshakeServer(secondReceived);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: first.port,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'olduser',
    realName: 'Old User',
  }));

  try {
    runtime.connect(network.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));

    runtime.disconnect(network.id);
    runtime.saveNetwork({
      ...network,
      host: '127.0.0.1',
      port: second.port,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
    });

    runtime.connect(network.id);
    await waitFor(() => secondReceived.includes('NICK newnick'));
  } finally {
    runtime.disconnect(network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('saving a connected network reconnects with updated settings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createRegisteredServer(firstReceived);
  const second = await createRegisteredServer(secondReceived);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: first.port,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'olduser',
    realName: 'Old User',
  }));

  try {
    runtime.connect(network.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));
    await waitFor(() => firstReceived.includes('USER olduser 0 * :Old User'));

    runtime.saveNetwork({
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
    assert.equal(storage.getNetwork(network.id)?.nick, 'newnick');
  } finally {
    runtime.disconnect(network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime snapshot includes live network states after a refresh point', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const server = await createRegisteredServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
  }));

  try {
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    assert.deepEqual(runtime.snapshot().networkStates[network.id], {
      phase: 'connected',
      serverName: 'irc.example',
      nick: 'tester',
    });
  } finally {
    runtime.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime snapshot includes aggregated friend presence from live connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const server = await createIsonServer(received, ['Alice']);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
  }));
  const friend = runtime.upsertFriend('Alice');

  try {
    runtime.connect(network.id);
    await waitFor(() => received.some((line) => line === 'ISON Alice'));
    await waitFor(() => runtime.snapshot().friendPresence[friend.id] === true);

    assert.equal(runtime.snapshot().friendPresence[friend.id], true);
  } finally {
    runtime.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime clears cached friend presence when a network disconnects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const server = await createIsonServer(received, ['Alice']);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
  }));
  const friend = runtime.upsertFriend('Alice');

  try {
    runtime.connect(network.id);
    await waitFor(() => received.some((line) => line === 'ISON Alice'));
    await waitFor(() => runtime.snapshot().friendPresence[friend.id] === true);

    runtime.disconnect(network.id);
    await waitFor(() => runtime.snapshot().friendPresence[friend.id] === false);

    assert.equal(runtime.snapshot().friendPresence[friend.id], false);
  } finally {
    runtime.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('saving a template network updates live hidden instances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createRegisteredServer(firstReceived);
  const second = await createRegisteredServer(secondReceived);
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
    host: 'irc.example.test',
    port: 6667,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'olduser',
    realName: 'Old User',
  }));
  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
    host: '127.0.0.1',
    port: first.port,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'olduser',
    realName: 'Old User',
  }));

  try {
    runtime.connect(clone.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));
    await waitFor(() => firstReceived.includes('USER olduser 0 * :Old User'));

    runtime.saveNetwork({
      ...template,
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
    assert.equal(storage.getNetwork(clone.id)?.host, '127.0.0.1');
    assert.equal(storage.getNetwork(clone.id)?.port, second.port);
    assert.equal(storage.getNetwork(clone.id)?.nick, 'newnick');
  } finally {
    runtime.disconnect(clone.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel events keep the untouched half of channel state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());

  storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'old topic',
    unread: 2,
    users: [makeUser('alice'), makeUser('bob')],
  });

  handleRuntimeEvent({ store: storage, send() {} }, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    topic: 'new topic',
  });
  assert.deepEqual(storage.getChannelByName(network.id, '#help'), {
    id: storage.getChannelByName(network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    users: [makeUser('alice'), makeUser('bob')],
  });
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 2);

  handleRuntimeEvent({ store: storage, send() {} }, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    users: [makeUser('carol')],
  });
  assert.deepEqual(storage.getChannelByName(network.id, '#help'), {
    id: storage.getChannelByName(network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    users: [makeUser('carol')],
  });
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 2);
});

test('system status events stay in the server buffer without banner notifications', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
    {
      type: 'status',
      networkId: network.id,
      message: 'Connecting to irc.example.test:6667',
      kind: 'system',
    }
  );

  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.ok(!sent.some((message) => message.type === 'notice' || message.type === 'error'));
  assert.equal(storage.listMessages(network.id, 'server', 5)[0]?.body, 'Connecting to irc.example.test:6667');
});

test('self direct messages create query buffers when none exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: 'message-1',
        networkId: network.id,
        target: 'helper',
        nick: 'tester',
        body: 'hello there',
        kind: 'line',
        self: true,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.getBufferByTarget(network.id, 'HELPER')?.kind, 'query');
  assert.equal(storage.listMessages(network.id, 'helper', 5)[0]?.body, 'hello there');
  assert.ok(sent.some((message) => message.type === 'buffer.upsert'));
  assert.ok(sent.some((message) => message.type === 'message.append'));
});

test('runtime join preserves existing channel metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const existing = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'saved topic',
    unread: 3,
    users: [makeUser('alice')],
  });

  runtime.join(network.id, '#help');

  assert.deepEqual(storage.getChannelByName(network.id, '#help'), existing);
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 3);
});

test('runtime join does not create a channel buffer when the join command is not sent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());

  runtime.join(network.id, '#missing');

  assert.equal(storage.getBufferByTarget(network.id, '#missing'), null);
  assert.equal(storage.getChannelByName(network.id, '#missing'), null);
  assert.deepEqual(
    storage.listMessages(network.id, 'server', 5).map((message) => message.body),
    ['Not connected']
  );
});

test('runtime part reports not connected before the first connection exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());

  runtime.part(network.id, '#help');

  assert.equal(storage.getBufferByTarget(network.id, '#help'), null);
  assert.deepEqual(
    storage.listMessages(network.id, 'server', 5).map((message) => message.body),
    ['Not connected']
  );
});

test('runtime join defers channel persistence until the server confirms the join', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  let requestedJoin: { channel: string; sourceTarget: string | undefined; visiblePending: boolean | undefined } | null = null;

  (runtime as unknown as {
    connections: Map<string, { join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }): boolean }>;
  }).connections.set(network.id, {
    join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }) {
      requestedJoin = { channel, sourceTarget, visiblePending: options?.visiblePending };
      return channel === '#missing';
    },
  });

  runtime.join(network.id, '#missing');

  assert.deepEqual(requestedJoin, { channel: '#missing', sourceTarget: 'server', visiblePending: true });
  assert.equal(storage.getBufferByTarget(network.id, '#missing'), null);
  assert.equal(storage.getChannelByName(network.id, '#missing'), null);
});

test('runtime rejoins existing channel buffers without surfacing a pending channel row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const existing = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'saved topic',
    users: [makeUser('alice')],
  });

  let requestedJoin: { channel: string; sourceTarget: string | undefined; visiblePending: boolean | undefined } | null = null;

  (runtime as unknown as {
    connections: Map<string, { join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }): boolean }>;
  }).connections.set(network.id, {
    join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }) {
      requestedJoin = { channel, sourceTarget, visiblePending: options?.visiblePending };
      return channel === '#help';
    },
  });

  runtime.join(network.id, '#help');

  assert.deepEqual(requestedJoin, { channel: '#help', sourceTarget: 'server', visiblePending: false });
  assert.equal(storage.getBuffer(existing.id)?.kind, 'channel');
  assert.equal(storage.getChannelByName(network.id, '#help')?.topic, 'saved topic');
});

test('runtime validation rejects missing networks and invalid targets before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'helper');
  const channel = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
  });

  assert.throws(() => runtime.join('missing-network', '#help'), /Network not found/);
  assert.throws(() => runtime.part('missing-network', '#help'), /Network not found/);
  assert.throws(() => runtime.closeBuffer('missing-buffer'), /Buffer not found/);
  assert.throws(() => runtime.join(network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.throws(() => runtime.join(network.id, '#help,#ops'), /Channel name must refer to a single channel/);
  assert.throws(() => runtime.part(network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.throws(() => runtime.openQuery(network.id, '   '), /Private-message target is required/);
  assert.throws(() => runtime.openQuery(network.id, '#help'), /Private-message target is required/);
  assert.throws(() => runtime.openQuery(network.id, 'alice,bob'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.upsertFriend('   '), /Private-message target is required/);
  assert.throws(() => runtime.upsertFriend('#help'), /Private-message target is required/);
  assert.throws(() => runtime.upsertFriend('alice,bob'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.removeFriend('missing-friend'), /Friend not found/);
  assert.throws(() => runtime.closeBuffer(channel.id), /Only private message buffers can be closed/);
  assert.throws(() => runtime.sendMessage(network.id, '   ', 'hello'), /Private-message target is required/);
  assert.throws(() => runtime.sendMessage(network.id, 'alice,bob', 'hello'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.sendMessage(network.id, '#help', '   '), /Message body is required/);
  assert.throws(
    () => runtime.sendMessage(network.id, '#help', 'hello\r\nOPER root'),
    /Message body cannot contain carriage returns or line feeds/
  );
  assert.throws(() => runtime.sendRaw(network.id, '   '), /Raw command is required/);
  assert.throws(
    () => runtime.sendRaw(network.id, 'JOIN #help\r\nOPER root'),
    /Raw command cannot contain carriage returns or line feeds/
  );

  assert.deepEqual(storage.listChannels(network.id), [channel]);
  assert.equal(storage.getBuffer(query.id)?.target, 'helper');
  assert.deepEqual(storage.listMessages(network.id, 'server', 10), []);
});

test('runtime sendRaw preserves quit commands and exact matching', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const handshake = await createRegisteredServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    runtime.sendRaw(network.id, 'QUITTER test');
    await waitFor(() => received.includes('QUITTER test'));
    assert.equal(received.includes('QUIT :Client disconnecting'), false);
    assert.equal(handshake.hasConnections(), true);

    runtime.sendRaw(network.id, 'QUIT :Bye for now');
    await waitFor(() => received.includes('QUIT :Bye for now'));
    assert.equal(received.includes('QUIT :Client disconnecting'), false);
    await waitFor(() => !handshake.hasConnections());
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime streams structured channel list events from IRC LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createListServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.attachSocket(socket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, socket);

    await waitFor(() => received.includes('LIST'));
    await waitFor(() => socket.sent.some((message) => message.type === 'channel.list.completed' && message.requestId === requestId));

    assert.ok(socket.sent.some((message) => message.type === 'channel.list.started' && message.requestId === requestId));
    assert.deepEqual(
      socket.sent
        .filter((message): message is Extract<ServerMessage, { type: 'channel.list.entry' }> => message.type === 'channel.list.entry')
        .map((message) => message.entry),
      [
        { name: '#help', users: 42, topic: 'Support room' },
        { name: '#ops', users: 7, topic: 'Operators' },
      ]
    );
  } finally {
    runtime.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime replays active LIST entries to a later requester without sending LIST twice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const firstSocket = createSocketRecorder();
  const secondSocket = createSocketRecorder();

  try {
    runtime.attachSocket(firstSocket);
    runtime.attachSocket(secondSocket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, firstSocket);
    await waitFor(() =>
      firstSocket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    const replayedRequestId = runtime.requestChannelList(network.id, secondSocket);
    assert.equal(replayedRequestId, requestId);
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.equal(received.filter((line) => line === 'LIST').length, 1);
    assert.equal(
      firstSocket.sent.filter(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      ).length,
      1
    );
    assert.deepEqual(
      secondSocket.sent
        .filter((message): message is Extract<ServerMessage, { type: 'channel.list.entry' }> => message.type === 'channel.list.entry')
        .map((message) => message.entry),
      [
        { name: '#help', users: 42, topic: 'Support room' },
        { name: '#ops', users: 7, topic: 'Operators' },
      ]
    );
  } finally {
    runtime.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime does not replay active LIST entries twice to the same requester', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.attachSocket(socket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, socket);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    const repeatedRequestId = runtime.requestChannelList(network.id, socket);
    assert.equal(repeatedRequestId, requestId);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.equal(received.filter((line) => line === 'LIST').length, 1);
    assert.equal(
      socket.sent.filter(
        (message) =>
          message.type === 'channel.list.started'
          && message.requestId === requestId
      ).length,
      1
    );
    assert.equal(
      socket.sent.filter(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      ).length,
      1
    );
    assert.equal(
      socket.sent.filter(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#ops'
      ).length,
      1
    );
  } finally {
    runtime.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime replays active LIST entries after the same requester cancels and reopens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.attachSocket(socket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, socket);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    runtime.cancelChannelList(network.id, socket);
    socket.sent.length = 0;

    const reopenedRequestId = runtime.requestChannelList(network.id, socket);
    assert.equal(reopenedRequestId, requestId);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.equal(received.filter((line) => line === 'LIST').length, 1);
    assert.deepEqual(
      socket.sent.filter((message) => message.type.startsWith('channel.list')),
      [
        { type: 'channel.list.started', networkId: network.id, requestId },
        { type: 'channel.list.entry', networkId: network.id, requestId, entry: { name: '#help', users: 42, topic: 'Support room' } },
        { type: 'channel.list.entry', networkId: network.id, requestId, entry: { name: '#ops', users: 7, topic: 'Operators' } },
        { type: 'channel.list.completed', networkId: network.id, requestId },
      ]
    );
  } finally {
    runtime.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime drops channel-list events after the requester disconnects mid-LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const requesterSocket = createSocketRecorder();
  const observerSocket = createSocketRecorder();

  try {
    runtime.attachSocket(requesterSocket);
    runtime.attachSocket(observerSocket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, requesterSocket);
    await waitFor(() =>
      requesterSocket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    requesterSocket.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.deepEqual(
      observerSocket.sent.filter((message) => message.type.startsWith('channel.list')),
      []
    );
  } finally {
    runtime.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reports a failed channel-list request when the network disconnects mid-LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.attachSocket(socket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, socket);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    listServer.closeConnections();

    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.failed'
          && message.requestId === requestId
          && message.message === 'Channel list request was interrupted'
      )
    );
  } finally {
    runtime.disconnect(network.id);
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reports a failed channel-list request when disconnect is requested mid-LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createStreamingListServer(received, 500);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.attachSocket(socket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, socket);
    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.entry'
          && message.requestId === requestId
          && message.entry.name === '#help'
      )
    );

    runtime.disconnect(network.id);

    await waitFor(() =>
      socket.sent.some(
        (message) =>
          message.type === 'channel.list.failed'
          && message.requestId === requestId
          && message.message === 'Channel list request was interrupted'
      )
    );
  } finally {
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime removes channel-list subscribers after a request completes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createListServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const firstSocket = createSocketRecorder();
  const secondSocket = createSocketRecorder();

  try {
    runtime.attachSocket(firstSocket);
    runtime.attachSocket(secondSocket);
    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const firstRequestId = runtime.requestChannelList(network.id, firstSocket);
    await waitFor(() =>
      firstSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === firstRequestId
      )
    );

    firstSocket.sent.length = 0;

    const secondRequestId = runtime.requestChannelList(network.id, secondSocket);
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === secondRequestId
      )
    );

    assert.notEqual(secondRequestId, firstRequestId);
    assert.deepEqual(
      firstSocket.sent.filter((message) => message.type.startsWith('channel.list')),
      []
    );
  } finally {
    runtime.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime drops sockets whose websocket send throws without aborting the broadcast', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const healthySocket = createSocketRecorder();
  const throwingSocket = createThrowingSocket();

  runtime.attachSocket(healthySocket);
  runtime.attachSocket(throwingSocket as WebSocket);

  assert.doesNotThrow(() => {
    runtime.send({ type: 'notice', networkId: null, message: 'hello' });
  });
  assert.deepEqual(healthySocket.sent, [{ type: 'notice', networkId: null, message: 'hello' }]);
  assert.equal(throwingSocket.closed, true);
});

test('runtime rejects oversized outbound lines without writing them to the socket', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const server = await createRegisteredServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
  }));

  try {
    runtime.connect(network.id);
    await waitFor(() => received.includes('NICK tester'));

    runtime.sendMessage(network.id, 'helper', 'x'.repeat(600));
    runtime.sendRaw(network.id, `NOTICE helper :${'y'.repeat(600)}`);

    await waitFor(
      () =>
        storage.listMessages(network.id, 'helper', 20)
          .filter((message) => message.body === 'IRC command exceeds the 510-byte limit')
          .length >= 1
        && storage.listMessages(network.id, 'server', 20)
          .filter((message) => message.body === 'IRC command exceeds the 510-byte limit')
          .length >= 1
    );

    assert.equal(received.some((line) => line.includes(`PRIVMSG helper :${'x'.repeat(600)}`)), false);
    assert.equal(received.some((line) => line.includes(`NOTICE helper :${'y'.repeat(600)}`)), false);
  } finally {
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime sendMessage does not persist unsent direct messages while disconnected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());

  runtime.sendMessage(network.id, 'helper', 'hello');

  assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  assert.deepEqual(
    storage.listMessages(network.id, 'helper', 10).map((message) => ({
      target: message.target,
      kind: message.kind,
      body: message.body,
    })),
    [{ target: 'helper', kind: 'error', body: 'Not connected' }]
  );
  assert.deepEqual(storage.listMessages(network.id, 'server', 10), []);
});

test('runtime rejects client commands while the network is still connecting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    runtime.connect(network.id);
    runtime.join(network.id, '#help');
    runtime.sendMessage(network.id, 'helper', 'hello');
    runtime.sendRaw(network.id, 'WHOIS helper');

    await waitFor(
      () =>
        received.includes('NICK tester')
        && received.includes('USER tester 0 * :Tester Example')
    );
    await waitFor(
      () =>
        storage.listMessages(network.id, 'server', 20)
          .filter((message) => message.body === 'Still connecting to server')
          .length >= 2
        && storage.listMessages(network.id, 'helper', 20)
          .some((message) => message.body === 'Still connecting to server')
    );

    assert.equal(received.includes('JOIN #help'), false);
    assert.equal(received.includes('PRIVMSG helper :hello'), false);
    assert.equal(received.includes('WHOIS helper'), false);
    assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'channel'), []);
    assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reports a failed channel-list request while disconnected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const socket = createSocketRecorder();

  runtime.attachSocket(socket);

  const requestId = runtime.requestChannelList(network.id, socket);

  assert.equal(typeof requestId, 'string');
  assert.deepEqual(socket.sent, [
    {
      type: 'channel.list.failed',
      networkId: network.id,
      requestId,
      message: 'Not connected',
    },
  ]);
});

test('runtime reports when a timed-out LIST is still draining late server replies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const socket = createSocketRecorder();

  runtime.attachSocket(socket);
  (runtime as unknown as {
    connections: Map<string, {
      getActiveChannelListSnapshot(): { requestId: string; entries: ChannelListEntry[] } | null;
      requestChannelList(requestId: string): boolean;
      getChannelListRequestFailureMessage(): string;
    }>;
  }).connections.set(network.id, {
    getActiveChannelListSnapshot() {
      return null;
    },
    requestChannelList() {
      return false;
    },
    getChannelListRequestFailureMessage() {
      return 'Waiting for the previous channel list response to finish';
    },
  });

  const requestId = runtime.requestChannelList(network.id, socket);

  assert.equal(typeof requestId, 'string');
  assert.deepEqual(socket.sent, [
    {
      type: 'channel.list.failed',
      networkId: network.id,
      requestId,
      message: 'Waiting for the previous channel list response to finish',
    },
  ]);
});

test('runtime removes channel-list subscribers after an immediate request failure', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const listServer = await createListServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const firstSocket = createSocketRecorder();
  const secondSocket = createSocketRecorder();

  try {
    runtime.attachSocket(firstSocket);
    runtime.attachSocket(secondSocket);

    const failedRequestId = runtime.requestChannelList(network.id, firstSocket);
    assert.deepEqual(firstSocket.sent, [
      {
        type: 'channel.list.failed',
        networkId: network.id,
        requestId: failedRequestId,
        message: 'Not connected',
      },
    ]);

    firstSocket.sent.length = 0;

    runtime.connect(network.id);
    await waitFor(() => runtime.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.requestChannelList(network.id, secondSocket);
    await waitFor(() =>
      secondSocket.sent.some(
        (message) =>
          message.type === 'channel.list.completed'
          && message.requestId === requestId
      )
    );

    assert.deepEqual(
      firstSocket.sent.filter((message) => message.type.startsWith('channel.list')),
      []
    );
  } finally {
    runtime.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('deleteNetwork removes runtime connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    name: 'DeleteNet',
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'deleter',
    altNicks: ['deleter_', 'deleter__'],
    username: 'deleter',
    realName: 'deleter',
  }));
  const state = runtime as unknown as { connections: Map<string, unknown> };

  try {
    runtime.connect(network.id);
    await waitFor(() => state.connections.has(network.id));

    runtime.deleteNetwork(network.id);

    assert.equal(state.connections.has(network.id), false);
    assert.equal(storage.getNetwork(network.id), null);
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime close disconnects active connections without appending shutdown noise', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const handshake = await createHandshakeServer([]);
  const network = storage.upsertNetwork(createNetworkInput({
    name: 'CloseNet',
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'close',
    altNicks: ['close_', 'close__'],
    username: 'close',
    realName: 'close',
  }));
  const state = runtime as unknown as { connections: Map<string, unknown> };

  try {
    runtime.connect(network.id);
    await waitFor(() => handshake.hasConnections());
    const beforeShutdownMessages = storage.listMessages(network.id, 'server', 20).map((message) => message.body);

    runtime.close();

    await waitFor(() => !handshake.hasConnections());
    assert.equal(state.connections.size, 0);
    assert.deepEqual(
      storage.listMessages(network.id, 'server', 20).map((message) => message.body),
      beforeShutdownMessages
    );
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('deleteNetwork removes hidden clone connections when deleting a template', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const received: string[] = [];
  const handshake = await createHandshakeServer(received);
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
    nick: 'template',
    altNicks: ['template_', 'template__'],
    username: 'template',
    realName: 'template',
  }));
  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    host: '127.0.0.1',
    port: handshake.port,
    nick: 'template',
    altNicks: ['template_', 'template__'],
    username: 'template',
    realName: 'template',
  }));
  const state = runtime as unknown as { connections: Map<string, unknown> };
  let uncaught: string | null = null;
  const onUncaught = (error: unknown) => {
    uncaught = error instanceof Error ? error.message : String(error);
  };
  process.once('uncaughtException', onUncaught);

  try {
    runtime.connect(clone.id);
    await waitFor(() => received.includes('NICK template'));

    runtime.deleteNetwork(template.id);
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(storage.getNetwork(template.id), null);
    assert.equal(storage.getNetwork(clone.id), null);
    assert.equal(state.connections.has(clone.id), false);
    assert.equal(uncaught, null);
  } finally {
    process.removeListener('uncaughtException', onUncaught);
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('self part events remove the channel and emit buffer.remove', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const channel = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'support',
    unread: 0,
    users: [makeUser('tester'), makeUser('alice')],
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
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

  assert.equal(storage.getChannelByName(network.id, '#help'), null);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(
    sent.find((message) => message.type === 'buffer.remove'),
    {
      type: 'buffer.remove',
      networkId: network.id,
      bufferId: channel.id,
    }
  );
});

test('late duplicate self part events do not recreate the channel buffer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'support',
    unread: 0,
    users: [makeUser('tester')],
  });

  const event = () => ({
    type: 'message' as const,
    message: {
      id: randomUUID(),
      networkId: network.id,
      target: '#help',
      nick: 'tester',
      body: 'tester left #help (Leaving)',
      kind: 'part' as const,
      self: true,
      ts: Date.now(),
    },
  });

  handleRuntimeEvent({ store: storage, send() {} }, event());
  handleRuntimeEvent({ store: storage, send() {} }, event());

  assert.equal(storage.getBufferByTarget(network.id, '#help'), null);
  assert.equal(storage.listMessages(network.id, '#help', 10).length, 1);
});

test('late duplicate self kick events do not append orphaned history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'support',
    unread: 0,
    users: [makeUser('tester')],
  });

  const event = () => ({
    type: 'message' as const,
    message: {
      id: randomUUID(),
      networkId: network.id,
      target: '#help',
      nick: 'tester',
      body: 'tester was kicked from #help by op (bye)',
      kind: 'part' as const,
      self: true,
      ts: Date.now(),
    },
  });

  handleRuntimeEvent({ store: storage, send() {} }, event());
  handleRuntimeEvent({ store: storage, send() {} }, event());

  assert.equal(storage.getBufferByTarget(network.id, '#help'), null);
  assert.equal(storage.listMessages(network.id, '#help', 10).length, 1);
});

test('incoming private messages open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
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

  assert.equal(storage.getBufferByTarget(network.id, 'helper')?.target, 'helper');
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.getBufferByTarget(network.id, 'helper'),
  });
});

test('incoming private messages reuse an existing query buffer across IRC nick casing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const existingQuery = storage.upsertQuery(network.id, 'Alice');
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'alice',
        nick: 'alice',
        body: 'hello again',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);
  assert.equal(storage.getBufferByTarget(network.id, 'ALICE')?.id, existingQuery.id);
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.getBuffer(existingQuery.id),
  });
});

test('self-sent private messages open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'helper',
        nick: 'tester',
        body: 'hello there',
        kind: 'line',
        self: true,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.getBufferByTarget(network.id, 'helper')?.kind, 'query');
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.equal(
    sent.some((message) => {
      const buffer = message.buffer as { kind?: string } | undefined;
      return message.type === 'buffer.upsert' && buffer?.kind === 'query';
    }),
    true
  );
});

test('service messages on the server buffer close stale service queries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'NickServ');
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'server',
        nick: 'NickServ',
        body: 'Use IDENTIFY first',
        kind: 'line',
        self: false,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.getBufferByTarget(network.id, 'NickServ'), null);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(sent.find((message) => message.type === 'buffer.remove'), {
    type: 'buffer.remove',
    networkId: network.id,
    bufferId: query.id,
  });
});

test('status events keep their originating buffer target and message kind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const channel = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: '',
    users: [makeUser('tester')],
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(message) { sent.push(message); } },
    {
      type: 'status',
      networkId: network.id,
      target: '#help',
      kind: 'error',
      message: '* You need to be identified to message that user',
    }
  );

  const appended = storage.listMessages(network.id, '#help', 10);
  assert.equal(appended.length, 1);
  assert.equal(appended[0]?.target, '#help');
  assert.equal(appended[0]?.kind, 'error');
  assert.equal(storage.getBuffer(channel.id)?.unread, 1);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.deepEqual(sent.find((message) => message.type === 'buffer.upsert'), {
    type: 'buffer.upsert',
    buffer: storage.getBuffer(channel.id),
  });
});

test('late status events fall back to the server buffer after a channel closes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const channel = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: '',
    users: [makeUser('tester')],
  });

  storage.deleteChannelByName(network.id, channel.name);

  handleRuntimeEvent(
    { store: storage, send() {} },
    {
      type: 'status',
      networkId: network.id,
      target: '#help',
      kind: 'error',
      message: 'No such channel',
    }
  );

  assert.equal(storage.getBufferByTarget(network.id, '#help'), null);
  assert.equal(storage.listMessages(network.id, 'server', 5).at(-1)?.body, 'No such channel');
});

test('late status events fall back to the server buffer after a query closes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'helper');

  storage.removeBuffer(query.id);

  handleRuntimeEvent(
    { store: storage, send() {} },
    {
      type: 'status',
      networkId: network.id,
      target: 'helper',
      kind: 'error',
      message: 'No such nick',
      requireBoundTarget: true,
    }
  );

  assert.equal(storage.getBufferByTarget(network.id, 'helper'), null);
  assert.equal(storage.listMessages(network.id, 'server', 5).at(-1)?.body, 'No such nick');
});
