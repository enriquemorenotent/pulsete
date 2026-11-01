import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { createPresenceServer } from './helpers/runtime-test-handshake-servers.js';
import { waitFor } from './helpers/async-test-helpers.js';

test('activity endpoint receives real IRC observations and preserves history after disconnect', async () => {
  const c = await createHttpRuntimeContext();
  const received: string[] = [];
  const irc = await createPresenceServer(received, { Alice: 'online' });
  const network = c.storage.networks.upsert(createNetworkInput({ host: '127.0.0.1', port: irc.port }));
  const friend = c.runtime.friends.upsertFriend('Alice').friend;
  try {
    const empty = await requestJson(c.port, 'GET', `/api/friends/${friend.id}/activity`);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.json.intervals, []);
    c.runtime.sessions.connect(network.id);
    await waitFor(() => c.runtime.gateway.snapshot().friendPresence[friend.id] === 'online');
    const observed = await requestJson(c.port, 'GET', `/api/friends/${friend.id}/activity`);
    assert.equal(observed.status, 200);
    const rows = observed.json.intervals as { status: string; arrival: boolean; end: number }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, 'online');
    assert.equal(rows[0]!.arrival, false);
    c.runtime.sessions.disconnect(network.id);
    const disconnected = await requestJson(c.port, 'GET', `/api/friends/${friend.id}/activity`);
    const disconnectedRows = disconnected.json.intervals as typeof rows;
    assert.equal(disconnectedRows.length, 1);
    assert.equal(disconnectedRows[0]!.status, 'online');
    assert.equal((await requestJson(c.port, 'GET', '/api/friends/missing/activity')).status, 404);
  } finally {
    c.runtime.gateway.close();
    irc.closeConnections();
    await new Promise<void>((resolve) => irc.server.close(() => resolve()));
    await c.close();
  }
});
