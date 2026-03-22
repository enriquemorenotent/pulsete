import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { attachWebSocketServer } from '../server/ws-server.js';
import { type NetworkProfile } from '../shared/protocol.js';
import { waitFor } from './helpers/async-test-helpers.js';
import { listen,requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('saving a hidden connection instance broadcasts its server buffer before the network update', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
    nick: 'oldnick',
    altNicks: ['oldnick_'],
    username: 'olduser',
    realName: 'Old User',
  }));
  const instance = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
    nick: 'oldnick',
    altNicks: ['oldnick_'],
    username: 'olduser',
    realName: 'Old User',
  }));
  const server = createServer(createHttpHandler(runtime.context));
  attachWebSocketServer(server, runtime.context);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);
  const messages: Record<string, unknown>[] = [];
  socket.on('message', (payload) => {
    messages.push(JSON.parse(payload.toString()) as Record<string, unknown>);
  });

  try {
    const response = await requestJson(port, 'PUT', `/api/networks/${instance.id}`, {
      ...instance,
      nick: 'newnick',
      altNicks: ['newnick_'],
      username: 'newuser',
      realName: 'New User',
    });
    assert.equal(response.status, 200);

    await waitFor(() => {
      const relevant = messages.filter((message) =>
        (message.type === 'buffer.upsert' && (message.buffer as { networkId: string }).networkId === instance.id)
        || (message.type === 'network.upsert' && (message.network as { id: string }).id === instance.id)
      );
      return relevant.length >= 2;
    });

    const relevant = messages.filter((message) =>
      (message.type === 'buffer.upsert' && (message.buffer as { networkId: string }).networkId === instance.id)
      || (message.type === 'network.upsert' && (message.network as { id: string }).id === instance.id)
    );
    assert.deepEqual(relevant.slice(0, 2).map((message) => message.type), ['buffer.upsert', 'network.upsert']);
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('delete returns all deleted network ids when removing a template', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
  }));
  const clone = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'TemplateNet clone',
  }));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).context));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'DELETE', `/api/networks/${template.id}`);
    assert.equal(response.status, 200);
    assert.deepEqual(
      [...(response.json.deletedNetworkIds as string[])].sort(),
      [clone.id, template.id].sort()
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('duplicate creates a new saved network and preserves encrypted passwords', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput({
    name: 'PrimaryNet',
    host: 'irc.primary.test',
    port: 6697,
    tls: true,
    nick: 'sofia',
    altNicks: ['sofia_', 'sofia__'],
    username: 'sofia',
    realName: 'Sofia',
    password: 'hunter2',
    favorite: true,
    autoJoin: ['#help'],
  }));
  const server = createServer(createHttpHandler(runtime.context));
  attachWebSocketServer(server, runtime.context);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const updatePromise = waitForWebSocketMessageType(socket, 'network.upsert');
    const response = await requestJson(port, 'POST', `/api/networks/${network.id}/duplicate`, {});
    assert.equal(response.status, 200);

    const duplicate = response.json.network as NetworkProfile;
    assert.notEqual(duplicate.id, network.id);
    assert.equal(duplicate.name, 'PrimaryNet copy');
    assert.equal(duplicate.host, network.host);
    assert.equal(duplicate.port, network.port);
    assert.equal(duplicate.tls, network.tls);
    assert.equal(duplicate.nick, network.nick);
    assert.deepEqual(duplicate.altNicks, network.altNicks);
    assert.equal(duplicate.username, network.username);
    assert.equal(duplicate.realName, network.realName);
    assert.equal(duplicate.favorite, true);
    assert.deepEqual(duplicate.autoJoin, ['#help']);
    assert.equal(duplicate.managerHidden, false);
    assert.equal(duplicate.templateId, null);
    assert.equal(duplicate.hasPassword, true);
    assert.equal(storage.networks.getRuntime(duplicate.id)?.password, 'hunter2');

    const update = await updatePromise as { network: NetworkProfile };
    assert.equal(update.network.id, duplicate.id);

    const secondResponse = await requestJson(port, 'POST', `/api/networks/${network.id}/duplicate`, {});
    assert.equal(secondResponse.status, 200);
    assert.equal((secondResponse.json.network as NetworkProfile).name, 'PrimaryNet copy 2');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('query routes validate missing networks and invalid targets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertQuery(network.id, 'helper');
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
  });
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).context));
  const port = await listen(server);

  try {
    const missing = await requestJson(port, 'POST', '/api/networks/missing/queries', { target: 'helper' });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.message, 'Network not found');

    const invalidTarget = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: '#help' });
    assert.equal(invalidTarget.status, 400);
    assert.equal(invalidTarget.json.message, 'Private-message target is required');

    const reservedTarget = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: 'Server' });
    assert.equal(reservedTarget.status, 400);
    assert.equal(reservedTarget.json.message, 'Private-message target is required');

    const multipleTargets = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: 'alice,bob' });
    assert.equal(multipleTargets.status, 400);
    assert.equal(multipleTargets.json.message, 'Private-message target must refer to a single nick');

    const invalidPayload = await requestJson(port, 'POST', `/api/networks/${network.id}/queries`, { target: {} });
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.json.message, 'Invalid query payload');

    const invalidClose = await requestJson(port, 'DELETE', `/api/buffers/${channel.id}`);
    assert.equal(invalidClose.status, 400);
    assert.equal(invalidClose.json.message, 'Only private message buffers can be closed');
    assert.equal(storage.conversations.getBuffer(query.id)?.target, 'helper');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
