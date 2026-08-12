import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,makeUser,waitFor } from './helpers/runtime-test-common.js';
import { createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';

test('saving a connected network updates the live connection profile', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createRegisteredServer(firstReceived);
  const second = await createRegisteredServer(secondReceived);
  const network = storage.networks.upsert(createNetworkInput({
    workspaceOpen: true,
    name: 'Open network',
    host: '127.0.0.1',
    port: first.port,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    realName: 'Old User',
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));
    await waitFor(() => firstReceived.includes('USER oldnick 0 * :Old User'));

    runtime.networks.saveNetwork({
      ...network,
      host: '127.0.0.1',
      port: second.port,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      realName: 'New User',
    });

    await waitFor(() => secondReceived.includes('NICK newnick'));
    await waitFor(() => secondReceived.includes('USER newnick 0 * :New User'));
    await waitFor(() => !first.hasConnections());
    assert.equal(storage.networks.get(network.id)?.host, '127.0.0.1');
    assert.equal(storage.networks.get(network.id)?.port, second.port);
    assert.equal(storage.networks.get(network.id)?.nick, 'newnick');
  } finally {
    runtime.sessions.disconnect(network.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel events keep the untouched half of channel state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());

  storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'old topic',
    unread: 2,
    users: [makeUser('alice'), makeUser('bob')],
  });

  handleRuntimeEvent({ store: storage, publish() {} }, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    topic: 'new topic',
  });
  assert.deepEqual(storage.conversations.getChannelByName(network.id, '#help'), {
    id: storage.conversations.getChannelByName(network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    users: [makeUser('alice'), makeUser('bob')],
  });
  assert.equal(storage.conversations.getBufferByTarget(network.id, '#help')?.unread, 2);

  handleRuntimeEvent({ store: storage, publish() {} }, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    users: [makeUser('carol')],
  });
  assert.deepEqual(storage.conversations.getChannelByName(network.id, '#help'), {
    id: storage.conversations.getChannelByName(network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    users: [makeUser('carol')],
  });
  assert.equal(storage.conversations.getBufferByTarget(network.id, '#help')?.unread, 2);
});

test('system status events stay in the server buffer without banner notifications', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'status',
      networkId: network.id,
      message: 'Connecting to irc.example.test:6667',
      kind: 'system',
    }
  );

  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.ok(!sent.some((message) => message.type === 'notice' || message.type === 'error'));
  assert.equal(storage.conversations.listMessages(network.id, 'server', 5)[0]?.body, 'Connecting to irc.example.test:6667');
});

test('server error status events stay in the server buffer without banner notifications', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'status',
      networkId: network.id,
      message: 'Unable to connect to irc.example.test:6667 (Connection closed)',
      kind: 'error',
    }
  );

  const appended = storage.conversations.listMessages(network.id, 'server', 5);
  assert.equal(appended[0]?.body, 'Unable to connect to irc.example.test:6667 (Connection closed)');
  assert.equal(appended[0]?.kind, 'error');
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.ok(!sent.some((message) => message.type === 'notice' || message.type === 'error'));
});

test('server notice status events stay in the server buffer without banner notifications', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'status',
      networkId: network.id,
      message: 'Reconnecting (1/3)',
      kind: 'notice',
    }
  );

  const appended = storage.conversations.listMessages(network.id, 'server', 5);
  assert.equal(appended[0]?.body, 'Reconnecting (1/3)');
  assert.equal(appended[0]?.kind, 'notice');
  assert.ok(sent.some((message) => message.type === 'message.append'));
  assert.ok(!sent.some((message) => message.type === 'notice' || message.type === 'error'));
});

test('self direct messages create query buffers when none exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: 'message-1',
        networkId: network.id,
        target: 'helper',
        nick: 'tester',
        body: 'hello there',
        kind: 'line',
        self: true,
        ts: Date.now(),
      },
    }
  );

  assert.equal(storage.conversations.getBufferByTarget(network.id, 'HELPER')?.kind, 'query');
  assert.equal(storage.conversations.listMessages(network.id, 'helper', 5)[0]?.body, 'hello there');
  assert.ok(sent.some((message) => message.type === 'buffer.upsert'));
  assert.ok(sent.some((message) => message.type === 'message.append'));
});

test('runtime join preserves existing channel metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const network = storage.networks.upsert(createNetworkInput());
  const existing = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'saved topic',
    unread: 3,
    users: [makeUser('alice')],
  });

  runtime.irc.join(network.id, '#help');

  assert.deepEqual(storage.conversations.getChannelByName(network.id, '#help'), existing);
  assert.equal(storage.conversations.getBufferByTarget(network.id, '#help')?.unread, 3);
});

test('runtime join does not create a channel buffer when the join command is not sent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const network = storage.networks.upsert(createNetworkInput());

  runtime.irc.join(network.id, '#missing');

  assert.equal(storage.conversations.getBufferByTarget(network.id, '#missing'), null);
  assert.equal(storage.conversations.getChannelByName(network.id, '#missing'), null);
  assert.deepEqual(storage.conversations.listMessages(network.id, 'server', 5), []);
});

test('runtime part reports not connected before the first connection exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage);
  const network = storage.networks.upsert(createNetworkInput());

  runtime.irc.part(network.id, '#help');

  assert.equal(storage.conversations.getBufferByTarget(network.id, '#help'), null);
  assert.deepEqual(storage.conversations.listMessages(network.id, 'server', 5), []);
});
