import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage, makeStorageFile } from './helpers/storage-test-helpers.js';
import { createRuntime } from '../server/runtime.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';
import { createHandshakeServer, createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';

for (const registered of [false, true]) test(`manual disconnect ${registered ? 'after login' : 'during login'} adds no server message or unread activity`, async () => {
  const storage = new Storage(makeStorageFile());
  const runtime = createRuntime(storage);
  const server = await (registered ? createRegisteredServer([]) : createHandshakeServer([]));
  const network = storage.networks.upsert(createNetworkInput({ host: '127.0.0.1', port: server.port }));
  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => server.hasConnections());
    if (registered) await waitFor(() => runtime.connections.get(network.id)?.lifecycle.connected === true);
    const buffer = storage.conversations.getServerBuffer(network.id)!;
    storage.conversations.markBufferRead(buffer.id, { lastReadTs: null, lastReadMessageId: null });
    // Disconnecting must also preserve existing unread messages.
    if (!registered) storage.conversations.appendMessage({ id: 'existing', networkId: network.id,
      target: 'server', nick: null, body: 'Existing notice', kind: 'notice', self: false, ts: Date.now() });
    const before = storage.conversations.listAllMessagesForBuffer(buffer.id);
    const unread = storage.conversations.getBuffer(buffer.id)!.unread;

    runtime.sessions.disconnect(network.id);
    await waitFor(() => !server.hasConnections());

    assert.equal(runtime.connections.get(network.id)?.lifecycle.socket, null);
    assert.equal(runtime.connections.get(network.id)?.lifecycle.connected, false);
    assert.deepEqual(storage.conversations.listAllMessagesForBuffer(buffer.id), before);
    assert.equal(storage.conversations.getBuffer(buffer.id)!.unread, unread);
  } finally {
    runtime.gateway.close();
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close(error => error ? reject(error) : resolve()));
    storage.close();
  }
});

test('unexpected disconnect still records a server message and unread activity', async () => {
  const storage = new Storage(makeStorageFile());
  const runtime = createRuntime(storage);
  const server = await createRegisteredServer([]);
  const network = storage.networks.upsert(createNetworkInput({ host: '127.0.0.1', port: server.port }));
  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.connections.get(network.id)?.lifecycle.connected === true);
    const buffer = storage.conversations.getServerBuffer(network.id)!;
    storage.conversations.markBufferRead(buffer.id, { lastReadTs: null, lastReadMessageId: null });
    server.closeConnections();
    await waitFor(() => storage.conversations.listAllMessagesForBuffer(buffer.id)
      .some(message => message.body === 'Disconnected from server'));
    assert.ok(storage.conversations.getBuffer(buffer.id)!.unread > 0);
  } finally {
    runtime.gateway.close();
    server.closeConnections();
    await new Promise<void>((resolve, reject) => server.server.close(error => error ? reject(error) : resolve()));
    storage.close();
  }
});
