import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { channelListBatchSize } from '../shared/channel-list.js';
import type { ServerMessage } from '../shared/protocol.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,waitFor } from './helpers/runtime-test-common.js';
import { createBulkListServer } from './helpers/runtime-test-list-servers.js';
import { createSocketRecorder } from './helpers/runtime-test-sockets.js';

test('runtime sends large LIST replies in channel-list batches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const entryCount = channelListBatchSize * 2 + 100;
  const listServer = await createBulkListServer(received, entryCount);
  const network = storage.networks.upsert(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.gateway.attachSocket(socket);
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.sessions.requestChannelList(network.id, socket);
    await waitFor(() =>
      socket.sent.some((message) => message.type === 'channel.list.completed' && message.requestId === requestId)
    );

    const batches = socket.sent.filter(
      (message): message is Extract<ServerMessage, { type: 'channel.list.entries' }> =>
        message.type === 'channel.list.entries' && message.requestId === requestId,
    );
    const completed = socket.sent.find(
      (message) => message.type === 'channel.list.completed' && message.requestId === requestId,
    );

    assert.deepEqual(batches.map((message) => message.entries.length), [250, 250, 100]);
    assert.equal(batches.flatMap((message) => message.entries).length, entryCount);
    assert.deepEqual(completed, {
      type: 'channel.list.completed',
      networkId: network.id,
      requestId,
      totalEntries: entryCount,
      truncated: false,
    });
  } finally {
    runtime.sessions.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});
