import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,waitFor } from './helpers/runtime-test-common.js';
import {
  createHandshakeServer,
  createRegisteredServer,
} from './helpers/runtime-test-handshake-servers.js';

test('runtime stores untagged live messages with a generated timestamp', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let sawNick = false;
    let sawUser = false;
    let sentWelcome = false;

    const flush = () => {
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line.startsWith('NICK ')) {
          sawNick = true;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (!sentWelcome && sawNick && sawUser) {
          sentWelcome = true;
          socket.write(':irc.example 001 tester :Welcome\r\n');
          socket.write(':alice!user@example PRIVMSG tester :hello there\r\n');
        }
        index = buffer.indexOf('\n');
      }
    };

    socket.on('data', (chunk) => {
      buffer += chunk;
      flush();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: address.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    realName: 'Tester Example',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => storage.conversations.listAllMessages(network.id, 'alice').length === 1);

    const [message] = storage.conversations.listAllMessages(network.id, 'alice');
    assert.equal(message?.body, 'hello there');
    assert.equal(message?.target, 'alice');
    assert.equal(typeof message?.ts, 'number');
    assert.ok((message?.ts ?? 0) > 0);
  } finally {
    runtime.sessions.disconnect(network.id);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime uses updated network settings on reconnect', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createHandshakeServer(firstReceived);
  const second = await createHandshakeServer(secondReceived);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: first.port,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    realName: 'Old User',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));

    runtime.sessions.disconnect(network.id);
    runtime.networks.saveNetwork({
      ...network,
      host: '127.0.0.1',
      port: second.port,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      realName: 'New User',
    });

    runtime.sessions.connect(network.id);
    await waitFor(() => secondReceived.includes('NICK newnick'));
  } finally {
    runtime.sessions.disconnect(network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('saving a connected network reconnects with updated settings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createRegisteredServer(firstReceived);
  const second = await createRegisteredServer(secondReceived);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: first.port,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    realName: 'Old User',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));
    await waitFor(() => firstReceived.includes('USER oldnick 0 * :Old User'));

    runtime.networks.saveNetwork({
      ...network,
      host: '127.0.0.1',
      port: second.port,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      realName: 'New User',
    });

    await waitFor(() => secondReceived.includes('NICK newnick'));
    await waitFor(() => secondReceived.includes('USER newnick 0 * :New User'));
    await waitFor(() => !first.hasConnections());
    assert.equal(storage.networks.get(network.id)?.nick, 'newnick');
  } finally {
    runtime.sessions.disconnect(network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('saving a connected network reconnects when the username changes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createRegisteredServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    realName: 'Test User',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => received.includes('USER tester 0 * :Test User'));

    runtime.networks.saveNetwork({
      ...network,
      username: 'uid309962',
    });

    await waitFor(() => received.includes('USER uid309962 0 * :Test User'));
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reconnect restores saved channel buffers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createRegisteredServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
  }));

  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'Saved topic',
  });

  try {
    runtime.sessions.connect(network.id);

    await waitFor(() => received.includes('JOIN #help'));

    assert.deepEqual(runtime.gateway.snapshot().pendingChannels, []);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime reconnect deduplicates saved channels against autoJoin', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createRegisteredServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    autoJoin: ['#help', '#ops'],
  }));

  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#Help',
  });

  try {
    runtime.sessions.connect(network.id);

    await waitFor(() => received.includes('JOIN #help') && received.includes('JOIN #ops'));

    assert.equal(received.filter((line) => line === 'JOIN #help').length, 1);
    assert.equal(received.filter((line) => line === 'JOIN #ops').length, 1);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});
