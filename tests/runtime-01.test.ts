import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer,createIsonServer,createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';

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
    username: 'olduser',
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
      username: 'newuser',
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
    username: 'olduser',
    realName: 'Old User',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));
    await waitFor(() => firstReceived.includes('USER olduser 0 * :Old User'));

    runtime.networks.saveNetwork({
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
    assert.equal(storage.networks.get(network.id)?.nick, 'newnick');
  } finally {
    runtime.sessions.disconnect(network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
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

test('runtime snapshot includes live network states after a refresh point', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createRegisteredServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    assert.deepEqual(runtime.gateway.snapshot().networkStates[network.id], {
      phase: 'connected',
      serverName: 'irc.example',
      nick: 'tester',
    });
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime snapshot includes aggregated friend presence from live connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createIsonServer(received, ['Alice']);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
  }));
  const friend = runtime.friends.upsertFriend('Alice').friend;

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => received.some((line) => line === 'ISON Alice'));
    await waitFor(() => runtime.gateway.snapshot().friendPresence[friend.id] === true);

    assert.equal(runtime.gateway.snapshot().friendPresence[friend.id], true);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime clears cached friend presence when a network disconnects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createIsonServer(received, ['Alice']);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
  }));
  const friend = runtime.friends.upsertFriend('Alice').friend;

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => received.some((line) => line === 'ISON Alice'));
    await waitFor(() => runtime.gateway.snapshot().friendPresence[friend.id] === true);

    runtime.sessions.disconnect(network.id);
    await waitFor(() => runtime.gateway.snapshot().friendPresence[friend.id] === false);

    assert.equal(runtime.gateway.snapshot().friendPresence[friend.id], false);
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});
