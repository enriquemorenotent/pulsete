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

test('network save preserves exact passwords for sasl and inferred server pass', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);
  const saslPassword = ' secret pass ';
  const serverPassPassword = '  server secret  ';

  try {
    const saslResponse = await requestJson(port, 'POST', '/api/networks', createNetworkInput({
      authMethod: 'sasl-plain',
      authAccount: 'account',
      password: saslPassword,
    }));
    const saslNetwork = saslResponse.json.network as { id: string; authMethod: string };
    assert.equal(saslResponse.status, 200);
    assert.equal(saslNetwork.authMethod, 'sasl-plain');
    assert.equal(storage.networks.getRuntime(saslNetwork.id)?.password, saslPassword);

    const serverPassResponse = await requestJson(port, 'POST', '/api/networks', createNetworkInput({
      name: 'ServerPassNet',
      password: serverPassPassword,
    }));
    const serverPassNetwork = serverPassResponse.json.network as { id: string; authMethod: string };
    assert.equal(serverPassResponse.status, 200);
    assert.equal(serverPassNetwork.authMethod, 'server-pass');
    assert.equal(storage.networks.getRuntime(serverPassNetwork.id)?.password, serverPassPassword);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('network save rejects NickServ whitespace passwords and multi-line passwords', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const server = createServer(createHttpHandler(createRuntime(storage.runtimeStore).http));
  const port = await listen(server);

  try {
    const nickservWhitespace = await requestJson(port, 'POST', '/api/networks', {
      ...createNetworkInput(),
      authMethod: 'nickserv',
      authTarget: 'NickServ',
      password: 'secret code',
    });
    assert.equal(nickservWhitespace.status, 400);
    assert.equal(nickservWhitespace.json.message, 'NickServ passwords cannot contain whitespace');

    const multilinePassword = await requestJson(port, 'POST', '/api/networks', createNetworkInput({
      password: 'secret\r\ncode',
    }));
    assert.equal(multilinePassword.status, 400);
    assert.equal(multilinePassword.json.message, 'Password cannot contain carriage returns or line feeds');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
