import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,waitFor } from './helpers/runtime-test-common.js';
import {
  createPresenceServer,
} from './helpers/runtime-test-handshake-servers.js';

test('runtime clears cached friend presence when a network disconnects', async () => {
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
    realName: 'Tester Example',
  }));
  const friend = runtime.friends.upsertFriend('Alice').friend;

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => received.some((line) => line === 'ISON Alice'));
    await waitFor(() => runtime.gateway.snapshot().friendPresence[friend.id] === 'online');

    runtime.sessions.disconnect(network.id);
    await waitFor(() => runtime.gateway.snapshot().friendPresence[friend.id] === 'offline');

    assert.equal(runtime.gateway.snapshot().friendPresence[friend.id], 'offline');
  } finally {
    runtime.sessions.disconnect(network.id);
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
  }
});

