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
  createPresenceServer,
  createRegisteredServer,
} from './helpers/runtime-test-handshake-servers.js';

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
  const server = await createPresenceServer(received, { Alice: 'away' });
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
    await waitFor(() => runtime.gateway.snapshot().friendPresence[friend.id] === 'online');

    assert.equal(runtime.gateway.snapshot().friendPresence[friend.id], 'online');
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime snapshot includes presence for open query targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createPresenceServer(received, { Alice: 'online' });
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: server.port,
    nick: 'tester',
    altNicks: ['tester_', 'tester__'],
    username: 'tester',
    realName: 'Tester Example',
  }));
  const query = storage.conversations.upsertQuery(network.id, 'Alice');

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => received.some((line) => line === 'ISON Alice'));
    await waitFor(() => runtime.gateway.snapshot().queryPresence[query.id] === 'online');

    assert.equal(runtime.gateway.snapshot().queryPresence[query.id], 'online');
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('opening a query after connect starts tracking that target presence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createPresenceServer(received, { Alice: 'online' });
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

    const result = runtime.conversations.openQuery(network.id, 'Alice');
    await waitFor(() => received.filter((line) => line === 'ISON Alice').length >= 1);
    await waitFor(() => runtime.gateway.snapshot().queryPresence[result.buffer.id] === 'online');

    assert.equal(runtime.gateway.snapshot().queryPresence[result.buffer.id], 'online');
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('opening a query after connect does not emit an immediate offline presence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const server = await createPresenceServer(received, { Alice: 'online' });
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

    const result = runtime.conversations.openQuery(network.id, 'Alice');
    assert.equal(
      result.messages.some((message) =>
        message.type === 'query.presence'
        && message.bufferId === result.buffer.id
        && message.presence === 'offline'),
      false,
    );
    assert.equal(result.buffer.id in runtime.gateway.snapshot().queryPresence, false);

    await waitFor(() => runtime.gateway.snapshot().queryPresence[result.buffer.id] === 'online');
    assert.equal(runtime.gateway.snapshot().queryPresence[result.buffer.id], 'online');
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('query presence stays scoped to the query network', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createPresenceServer(firstReceived, {});
  const second = await createPresenceServer(secondReceived, {
    Alice: 'online',
  });
  const firstNetwork = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: first.port,
    nick: 'tester1',
    altNicks: ['tester1_', 'tester1__'],
    username: 'tester1',
    realName: 'Tester One',
  }));
  const secondNetwork = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: second.port,
    nick: 'tester2',
    altNicks: ['tester2_', 'tester2__'],
    username: 'tester2',
    realName: 'Tester Two',
  }));

  try {
    runtime.sessions.connect(firstNetwork.id);
    runtime.sessions.connect(secondNetwork.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[firstNetwork.id]?.phase === 'connected');
    await waitFor(() => runtime.gateway.snapshot().networkStates[secondNetwork.id]?.phase === 'connected');

    const result = runtime.conversations.openQuery(firstNetwork.id, 'Alice');
    await waitFor(() => firstReceived.some((line) => line === 'ISON Alice'));
    await waitFor(() => result.buffer.id in runtime.gateway.snapshot().queryPresence);

    assert.equal(runtime.gateway.snapshot().queryPresence[result.buffer.id], 'offline');
  } finally {
    runtime.sessions.disconnect(firstNetwork.id);
    runtime.sessions.disconnect(secondNetwork.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

