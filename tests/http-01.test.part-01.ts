import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { listen,requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

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

test('network save preserves workspace state on ordinary profile edits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput({
    workspaceOpen: true,
    name: 'Open network',
  }));
  const server = createServer(createHttpHandler(runtime.http));
  const port = await listen(server);

  try {
    const response = await requestJson(port, 'PUT', `/api/networks/${network.id}`, {
      ...network,
      name: 'Renamed network',
    });
    assert.equal(response.status, 200);
    assert.equal((response.json.network as { workspaceOpen: boolean }).workspaceOpen, true);
    assert.equal(storage.networks.get(network.id)?.name, 'Renamed network');
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
