import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Runtime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput,makeUser,waitFor } from './helpers/runtime-test-common.js';
import { createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';

test('saving a template network updates live hidden instances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const firstReceived: string[] = [];
  const secondReceived: string[] = [];
  const first = await createRegisteredServer(firstReceived);
  const second = await createRegisteredServer(secondReceived);
  const template = storage.upsertNetwork(createNetworkInput({
    name: 'TemplateNet',
    host: 'irc.example.test',
    port: 6667,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'olduser',
    realName: 'Old User',
  }));
  const clone = storage.upsertNetwork(createNetworkInput({
    templateId: template.id,
    managerHidden: true,
    name: 'Connection instance',
    host: '127.0.0.1',
    port: first.port,
    nick: 'oldnick',
    altNicks: ['oldnick_', 'oldnick__'],
    username: 'olduser',
    realName: 'Old User',
  }));

  try {
    runtime.sessions.connect(clone.id);
    await waitFor(() => firstReceived.includes('NICK oldnick'));
    await waitFor(() => firstReceived.includes('USER olduser 0 * :Old User'));

    runtime.networks.saveNetwork({
      ...template,
      host: '127.0.0.1',
      port: second.port,
      nick: 'newnick',
      altNicks: ['newnick_', 'newnick__'],
      username: 'newuser',
      realName: 'New User',
    });

    await waitFor(() => secondReceived.includes('NICK newnick'));
    await waitFor(() => secondReceived.includes('USER newuser 0 * :New User'));
    await waitFor(() => !first.hasConnections());
    assert.equal(storage.getNetwork(clone.id)?.host, '127.0.0.1');
    assert.equal(storage.getNetwork(clone.id)?.port, second.port);
    assert.equal(storage.getNetwork(clone.id)?.nick, 'newnick');
  } finally {
    runtime.sessions.disconnect(clone.id);
    first.closeConnections();
    second.closeConnections();
    await new Promise<void>((resolve, reject) => first.server.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => second.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('channel events keep the untouched half of channel state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());

  storage.upsertChannel({
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
  assert.deepEqual(storage.getChannelByName(network.id, '#help'), {
    id: storage.getChannelByName(network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    users: [makeUser('alice'), makeUser('bob')],
  });
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 2);

  handleRuntimeEvent({ store: storage, publish() {} }, {
    type: 'channel',
    networkId: network.id,
    channel: '#help',
    users: [makeUser('carol')],
  });
  assert.deepEqual(storage.getChannelByName(network.id, '#help'), {
    id: storage.getChannelByName(network.id, '#help')?.id ?? '',
    networkId: network.id,
    name: '#help',
    topic: 'new topic',
    users: [makeUser('carol')],
  });
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 2);
});

test('system status events stay in the server buffer without banner notifications', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
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
  assert.equal(storage.listMessages(network.id, 'server', 5)[0]?.body, 'Connecting to irc.example.test:6667');
});

test('self direct messages create query buffers when none exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.upsertNetwork(createNetworkInput());
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

  assert.equal(storage.getBufferByTarget(network.id, 'HELPER')?.kind, 'query');
  assert.equal(storage.listMessages(network.id, 'helper', 5)[0]?.body, 'hello there');
  assert.ok(sent.some((message) => message.type === 'buffer.upsert'));
  assert.ok(sent.some((message) => message.type === 'message.append'));
});

test('runtime join preserves existing channel metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());
  const existing = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'saved topic',
    unread: 3,
    users: [makeUser('alice')],
  });

  runtime.irc.join(network.id, '#help');

  assert.deepEqual(storage.getChannelByName(network.id, '#help'), existing);
  assert.equal(storage.getBufferByTarget(network.id, '#help')?.unread, 3);
});

test('runtime join does not create a channel buffer when the join command is not sent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());

  runtime.irc.join(network.id, '#missing');

  assert.equal(storage.getBufferByTarget(network.id, '#missing'), null);
  assert.equal(storage.getChannelByName(network.id, '#missing'), null);
  assert.deepEqual(
    storage.listMessages(network.id, 'server', 5).map((message) => message.body),
    ['Not connected']
  );
});

test('runtime part reports not connected before the first connection exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage);
  const network = storage.upsertNetwork(createNetworkInput());

  runtime.irc.part(network.id, '#help');

  assert.equal(storage.getBufferByTarget(network.id, '#help'), null);
  assert.deepEqual(
    storage.listMessages(network.id, 'server', 5).map((message) => message.body),
    ['Not connected']
  );
});
