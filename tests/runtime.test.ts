import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Runtime } from '../server/runtime.js';
import { Storage, type NetworkInput } from '../server/storage.js';

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
    users: ['alice', 'bob'],
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
    users: ['alice', 'bob'],
  });
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 2);

  handleRuntimeEvent({ store: storage, send() {} }, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    users: ['carol'],
  });
  assert.deepEqual(storage.getChannelByName(network.id, '#help'), {
    id: storage.getChannelByName(network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    users: ['carol'],
  });
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 2);
});

test('system status events stay in the server buffer without banner notifications', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(_legacyUserId, message) { sent.push(message); } },
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
    users: ['alice'],
  });

  runtime.join(network.id, '#help');

  assert.deepEqual(storage.getChannelByName(network.id, '#help'), existing);
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 3);
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
  assert.throws(() => runtime.part(network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.throws(() => runtime.openQuery(network.id, '   '), /Private-message target is required/);
  assert.throws(() => runtime.openQuery(network.id, '#help'), /Private-message target is required/);
  assert.throws(() => runtime.upsertFriend('   '), /Private-message target is required/);
  assert.throws(() => runtime.upsertFriend('#help'), /Private-message target is required/);
  assert.throws(() => runtime.removeFriend('missing-friend'), /Friend not found/);
  assert.throws(() => runtime.closeBuffer(channel.id), /Only private message buffers can be closed/);
  assert.throws(() => runtime.sendMessage(network.id, '   ', 'hello'), /Private-message target is required/);
  assert.throws(
    () => runtime.sendMessage(network.id, '#help', 'hello\r\nOPER root'),
    /Message body cannot contain carriage returns or line feeds/
  );
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
  const handshake = await createHandshakeServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    runtime.connect(network.id);
    await waitFor(() => handshake.hasConnections());

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

test('runtime sendMessage does not persist unsent direct messages while disconnected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());

  runtime.sendMessage(network.id, 'helper', 'hello');

  assert.deepEqual(storage.listBuffers(network.id).filter((buffer) => buffer.kind === 'query'), []);
  assert.deepEqual(storage.listMessages(network.id, 'helper', 10), []);
  assert.equal(storage.listMessages(network.id, 'server', 10).at(-1)?.body, 'Not connected');
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
    users: ['tester', 'alice'],
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(_legacyUserId, message) { sent.push(message); } },
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

test('incoming private messages open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(_legacyUserId, message) { sent.push(message); } },
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

test('self-sent private messages do not open query buffers automatically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(_legacyUserId, message) { sent.push(message); } },
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

  assert.equal(storage.getBufferByTarget(network.id, 'helper'), null);
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.equal(
    sent.some((message) => {
      const buffer = message.buffer as { kind?: string } | undefined;
      return message.type === 'buffer.upsert' && buffer?.kind === 'query';
    }),
    false
  );
});

test('service messages on the server buffer close stale service queries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'NickServ');
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, send(_legacyUserId, message) { sent.push(message); } },
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
