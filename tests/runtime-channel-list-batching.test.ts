import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type WebSocket from 'ws';
import { channelListBatchSize } from '../shared/channel-list.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { createRuntime } from '../server/runtime.js';
import { RuntimeChannelListService } from '../server/runtime-channel-lists.js';
import { Storage } from '../server/storage.js';
import type { IrcRuntimeChannelListConnection } from '../server/irc-types.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';
import { createBulkListServer } from './helpers/runtime-test-list-servers.js';
import { createSocketRecorder } from './helpers/runtime-test-sockets.js';

test('runtime sends large LIST replies in channel-list batches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
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

test('runtime clears pending channel-list batches when replacing a stale session', () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduled: Array<{ callback: () => void; delay: number; cancelled: boolean }> = [];
  const timerEntries = new Map<ReturnType<typeof setTimeout>, typeof scheduled[number]>();
  global.setTimeout = (((callback: () => void, delay?: number) => {
    const entry = {
      callback,
      delay: Number(delay ?? 0),
      cancelled: false,
    };
    scheduled.push(entry);
    const handle = originalSetTimeout(() => {}, 60_000);
    handle.unref?.();
    timerEntries.set(handle, entry);
    return handle;
  }) as typeof setTimeout);
  global.clearTimeout = (((handle?: ReturnType<typeof setTimeout>) => {
    const entry = handle ? timerEntries.get(handle) : undefined;
    if (entry) {
      entry.cancelled = true;
    }
    if (handle) {
      timerEntries.delete(handle);
      originalClearTimeout(handle);
    }
  }) as typeof clearTimeout);

  try {
    const networkId = 'network-1';
    const socket = {} as WebSocket;
    const sent: ServerMessage[] = [];
    const service = new RuntimeChannelListService((_ws, message) => {
      sent.push(message);
    });
    const startingConnection: IrcRuntimeChannelListConnection = {
      getActiveChannelListSnapshot: () => null,
      getChannelListRequestFailureMessage: () => 'Not connected',
      requestChannelList: () => true,
    };

    service.request(networkId, startingConnection, 'old-request', socket);
    service.handle({
      type: 'channel-list-entry',
      networkId,
      requestId: 'old-request',
      entry: { name: '#old', users: 1, topic: '' },
    });

    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0]?.cancelled, false);

    const activeConnection: IrcRuntimeChannelListConnection = {
      getActiveChannelListSnapshot: () => ({
        requestId: 'new-request',
        entries: [],
        totalEntries: 0,
        truncated: false,
      }),
      getChannelListRequestFailureMessage: () => 'Not connected',
      requestChannelList: () => {
        throw new Error('active channel-list snapshots should be reused');
      },
    };

    service.request(networkId, activeConnection, 'client-request', socket);

    assert.equal(scheduled[0]?.cancelled, true);
    scheduled[0]?.callback();
    assert.equal(
      sent.some(
        (message) =>
          message.type === 'channel.list.entries'
          && message.requestId === 'old-request'
      ),
      false
    );
  } finally {
    for (const handle of timerEntries.keys()) {
      originalClearTimeout(handle);
    }
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
