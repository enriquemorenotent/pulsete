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
import { listen,requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { closeWebSocket,connectWebSocket,waitForWebSocketMessages } from './helpers/http-websocket-test-helpers.js';

test('network routes are available without cookies', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'GET', '/api/networks');
    assert.equal(response.status, 200);
    assert.equal((response.json.networks as unknown[]).length, 4);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('connect and disconnect return not found for missing networks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const connectResponse = await requestJson(port, 'POST', '/api/networks/missing/connect', {});
    assert.equal(connectResponse.status, 404);
    assert.equal(connectResponse.json.message, 'Network not found');

    const disconnectResponse = await requestJson(port, 'POST', '/api/networks/missing/disconnect', {});
    assert.equal(disconnectResponse.status, 404);
    assert.equal(disconnectResponse.json.message, 'Network not found');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects invalid payloads and IRC-unsafe fields', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const invalidResponse = await requestJson(port, 'POST', '/api/networks', {
      name: '',
      host: '',
      port: 0,
      tls: 'yes',
      nick: '',
      username: '',
      autoJoin: ['#test'],
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidResponse.json.message, 'Network name is required');

    const unsafeResponse = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      realName: 'Tester\r\nOPER root',
    });
    assert.equal(unsafeResponse.status, 400);
    assert.equal(unsafeResponse.json.message, 'Real name cannot contain carriage returns or line feeds');

    const unsafeAuthTarget = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      authMethod: 'nickserv',
      authTarget: 'Nick Serv',
    });
    assert.equal(unsafeAuthTarget.status, 400);
    assert.equal(unsafeAuthTarget.json.message, 'Authentication target must be a single nick');

    const channelAuthTarget = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      authMethod: 'nickserv',
      authTarget: '#ops',
    });
    assert.equal(channelAuthTarget.status, 400);
    assert.equal(channelAuthTarget.json.message, 'Authentication target must be a single nick');

    const multiAuthTarget = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      authMethod: 'nickserv',
      authTarget: 'NickServ,alice',
    });
    assert.equal(multiAuthTarget.status, 400);
    assert.equal(multiAuthTarget.json.message, 'Authentication target must refer to a single nick');

    const unsafeAuthAccount = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      authMethod: 'sasl-plain',
      authAccount: 'alice account',
    });
    assert.equal(unsafeAuthAccount.status, 400);
    assert.equal(unsafeAuthAccount.json.message, 'Authentication account cannot contain whitespace');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects invalid and immutable template relationships', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const template = storage.networks.upsert(createNetworkInput({
    name: 'TemplateNet',
  }));
  const otherTemplate = storage.networks.upsert(createNetworkInput({
    name: 'OtherTemplateNet',
    host: 'irc2.example.test',
    port: 6697,
    tls: true,
  }));
  const clone = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
  }));
  const server = createServer(createHttpHandler(runtime.http));
  const port = await listen(server);

  try {
    const visibleClone = await requestJson(port, 'POST', '/api/networks', {
      ...template,
      templateId: template.id,
      managerHidden: false,
      name: 'Visible clone',
    });
    assert.equal(visibleClone.status, 400);
    assert.equal(visibleClone.json.message, 'Saved networks cannot reference a template');

    const orphanInstance = await requestJson(port, 'POST', '/api/networks', {
      ...template,
      templateId: null,
      managerHidden: true,
      name: 'Orphan instance',
    });
    assert.equal(orphanInstance.status, 400);
    assert.equal(orphanInstance.json.message, 'Connection instances must reference an existing saved network');

    const reparentClone = await requestJson(port, 'PUT', `/api/networks/${clone.id}`, {
      ...clone,
      templateId: otherTemplate.id,
    });
    assert.equal(reparentClone.status, 400);
    assert.equal(reparentClone.json.message, 'Network template relationship cannot be changed after creation');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects conflicting and empty password updates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const conflict = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      password: 'secret',
      clearPassword: true,
    });
    assert.equal(conflict.status, 400);
    assert.equal(conflict.json.message, 'Password cannot be updated and cleared in the same request');

    const empty = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      password: '',
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.json.message, 'Password cannot be empty');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects auth methods without a saved password', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);
  const protectedNetwork = storage.networks.upsert(createNetworkInput({
    authMethod: 'nickserv',
    authTarget: 'NickServ',
    password: 'secret',
  }));

  try {
    const missingPassword = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      authMethod: 'sasl-plain',
      authAccount: 'account',
    });
    assert.equal(missingPassword.status, 400);
    assert.equal(missingPassword.json.message, 'Selected authentication method requires a saved password');

    const clearedPassword = await requestJson(port, 'PUT', `/api/networks/${protectedNetwork.id}`, {
      ...protectedNetwork,
      clearPassword: true,
    });
    assert.equal(clearedPassword.status, 400);
    assert.equal(clearedPassword.json.message, 'Selected authentication method requires a saved password');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save broadcasts template and instance updates over websocket', async () => {
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
  const clone = storage.networks.upsert(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
    nick: 'oldnick',
    altNicks: ['oldnick_'],
    username: 'olduser',
    realName: 'Old User',
  }));
  const server = createServer(createHttpHandler(runtime.http));
  attachWebSocketServer(server, runtime.ws);
  const port = await listen(server);
  const { socket } = await connectWebSocket(port);

  try {
    const updatesPromise = waitForWebSocketMessages(socket, 'network.upsert', 2);
    const response = await requestJson(port, 'PUT', `/api/networks/${template.id}`, {
      ...template,
      nick: 'newnick',
      altNicks: ['newnick_'],
      username: 'newuser',
      realName: 'New User',
    });
    assert.equal(response.status, 200);

    const updates = await updatesPromise;
    assert.deepEqual(
      updates.map((message) => (message.network as { id: string }).id).sort(),
      [clone.id, template.id].sort()
    );
    assert.equal(storage.networks.get(clone.id)?.nick, 'newnick');
    assert.equal(storage.networks.get(clone.id)?.username, 'newuser');
  } finally {
    await closeWebSocket(socket);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
