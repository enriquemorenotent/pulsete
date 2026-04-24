import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';
import { createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';

test('runtime channel close removes the local buffer and parts an existing connected session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const ircServer = await createRegisteredServer(received);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: ircServer.port,
  }));
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
  });

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.connections.get(network.id)?.state.phase === 'connected');
    await waitFor(() => received.includes('JOIN #help'));

    const result = runtime.conversations.closeBuffer(channel.id);
    const [removeMessage] = result.messages;

    assert.ok(removeMessage);
    if (removeMessage.type !== 'buffer.remove') {
      assert.fail(`Expected buffer.remove, received ${removeMessage.type}`);
    }
    assert.equal(removeMessage.networkId, network.id);
    assert.equal(removeMessage.bufferId, channel.id);
    assert.equal(storage.conversations.getChannelByName(network.id, '#help'), null);
    assert.deepEqual(runtime.connections.get(network.id)?.listReconnectChannels(), []);
    await waitFor(() => received.includes('PART #help :Leaving'));
  } finally {
    runtime.sessions.disconnect(network.id);
    ircServer.closeConnections();
    await new Promise<void>((resolve, reject) => ircServer.server.close((error) => (error ? reject(error) : resolve())));
    storage.close();
  }
});
