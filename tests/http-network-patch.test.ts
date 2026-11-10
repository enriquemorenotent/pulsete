import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpHandler } from '../server/http-router.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { listen, requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-patch-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const server = createServer(createHttpHandler(runtime.http));
  const port = await listen(server);
  const network = runtime.http.networks.save(createNetworkInput({
    notes: 'original', favorite: true, autoJoin: ['#original'],
    historicalSelfNicks: ['oldnick'], password: 'keep-this-secret', authMethod: 'server-pass',
  })).network;
  return { storage, network, port, async close() {
    runtime.gateway.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  } };
}

test('partial network updates preserve other settings, secrets and newer changes', async () => {
  const context = await setup();
  try {
    const { network, port, storage } = context;
    const path = `/api/networks/${network.id}`;
    // Independently issued edits should compose even if their clients had old profiles.
    for (const patch of [{ favorite: false }, { notes: 'new notes' }, { autoJoin: ['#new'] }, { host: 'new.example.test' }]) {
      const response = await requestJson(port, 'PATCH', path, patch);
      assert.equal(response.status, 200);
      const messages = response.json.messages as { type: string }[];
      assert.ok(messages.some(message => message.type === 'network.upsert'));
      assert.equal(JSON.stringify(response.json).includes('keep-this-secret'), false);
    }
    const expected = { ...network, favorite: false, notes: 'new notes', autoJoin: ['#new'], host: 'new.example.test' };
    assert.deepEqual(storage.networks.get(network.id), expected);
    assert.equal(storage.networks.getRuntime(network.id)?.password, 'keep-this-secret');
    assert.equal((await requestJson(port, 'PATCH', path, { notes: '', autoJoin: [] })).status, 200);
    assert.deepEqual(storage.networks.get(network.id), { ...expected, notes: '', autoJoin: [] });
  } finally { await context.close(); }
});

test('partial updates validate before saving, cannot create networks, and use the path ID', async () => {
  const context = await setup();
  try {
    const { network, port, storage } = context;
    const path = `/api/networks/${network.id}`;
    for (const invalid of [null, [], 'notes', { favorite: 'yes' }, { nick: 'bad nick' }, { host: 'bad\r\nhost' }, { password: '' }]) {
      assert.equal((await requestJson(port, 'PATCH', path, invalid)).status, 400);
      assert.deepEqual(storage.networks.get(network.id), network);
    }
    assert.equal((await requestJson(port, 'PATCH', '/api/networks/missing', { notes: 'x' })).status, 404);
    assert.equal((await requestJson(port, 'PATCH', path, { id: 'another', notes: 'correct target' })).status, 200);
    assert.equal(storage.networks.get(network.id)?.notes, 'correct target');
    assert.equal(storage.networks.get('another'), null);
  } finally { await context.close(); }
});
