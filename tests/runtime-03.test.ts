import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Runtime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import type { ServerMessage } from '../shared/protocol.js';
import { createNetworkInput,makeUser,waitFor } from './helpers/runtime-test-common.js';
import { createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';
import { createListServer } from './helpers/runtime-test-list-servers.js';
import { createSocketRecorder } from './helpers/runtime-test-sockets.js';

test('runtime join defers channel persistence until the server confirms the join', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const network = storage.upsertNetwork(createNetworkInput());
  let requestedJoin: { channel: string; sourceTarget: string | undefined; visiblePending: boolean | undefined } | null = null;

  (runtime as unknown as {
    connections: Map<string, {
      join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }): boolean;
    }>;
  }).connections.set(network.id, {
    join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }) {
      requestedJoin = { channel, sourceTarget, visiblePending: options?.visiblePending };
      return channel === '#missing';
    },
  });

  runtime.irc.join(network.id, '#missing');

  assert.deepEqual(requestedJoin, { channel: '#missing', sourceTarget: 'server', visiblePending: true });
  assert.equal(storage.getBufferByTarget(network.id, '#missing'), null);
  assert.equal(storage.getChannelByName(network.id, '#missing'), null);
});

test('runtime rejoins existing channel buffers without surfacing a pending channel row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const network = storage.upsertNetwork(createNetworkInput());
  const existing = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'saved topic',
    users: [makeUser('alice')],
  });

  let requestedJoin: { channel: string; sourceTarget: string | undefined; visiblePending: boolean | undefined } | null = null;

  (runtime as unknown as {
    connections: Map<string, {
      join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }): boolean;
    }>;
  }).connections.set(network.id, {
    join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }) {
      requestedJoin = { channel, sourceTarget, visiblePending: options?.visiblePending };
      return channel === '#help';
    },
  });

  runtime.irc.join(network.id, '#help');

  assert.deepEqual(requestedJoin, { channel: '#help', sourceTarget: 'server', visiblePending: false });
  assert.equal(storage.getBuffer(existing.id)?.kind, 'channel');
  assert.equal(storage.getChannelByName(network.id, '#help')?.topic, 'saved topic');
});

test('runtime validation rejects missing networks and invalid targets before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const network = storage.upsertNetwork(createNetworkInput());
  const query = storage.upsertQuery(network.id, 'helper');
  const channel = storage.upsertChannel({
    networkId: network.id,
    name: '#help',
  });

  assert.throws(() => runtime.irc.join('missing-network', '#help'), /Network not found/);
  assert.throws(() => runtime.irc.part('missing-network', '#help'), /Network not found/);
  assert.throws(() => runtime.conversations.closeBuffer('missing-buffer'), /Buffer not found/);
  assert.throws(() => runtime.irc.join(network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.throws(() => runtime.irc.join(network.id, '#help,#ops'), /Channel name must refer to a single channel/);
  assert.throws(() => runtime.irc.part(network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.throws(() => runtime.conversations.openQuery(network.id, '   '), /Private-message target is required/);
  assert.throws(() => runtime.conversations.openQuery(network.id, '#help'), /Private-message target is required/);
  assert.throws(() => runtime.conversations.openQuery(network.id, 'alice,bob'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.friends.upsertFriend('   '), /Private-message target is required/);
  assert.throws(() => runtime.friends.upsertFriend('#help'), /Private-message target is required/);
  assert.throws(() => runtime.friends.upsertFriend('alice,bob'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.friends.removeFriend('missing-friend'), /Friend not found/);
  assert.throws(() => runtime.conversations.closeBuffer(channel.id), /Only private message buffers can be closed/);
  assert.throws(() => runtime.irc.sendMessage(network.id, '   ', 'hello'), /Private-message target is required/);
  assert.throws(() => runtime.irc.sendMessage(network.id, 'alice,bob', 'hello'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.irc.sendMessage(network.id, '#help', '   '), /Message body is required/);
  assert.throws(
    () => runtime.irc.sendMessage(network.id, '#help', 'hello\r\nOPER root'),
    /Message body cannot contain carriage returns or line feeds/
  );
  assert.throws(() => runtime.irc.sendRaw(network.id, '   '), /Raw command is required/);
  assert.throws(
    () => runtime.irc.sendRaw(network.id, 'JOIN #help\r\nOPER root'),
    /Raw command cannot contain carriage returns or line feeds/
  );

  assert.deepEqual(storage.listChannels(network.id), [channel]);
  assert.equal(storage.getBuffer(query.id)?.target, 'helper');
  assert.deepEqual(storage.listMessages(network.id, 'server', 10), []);
});

test('runtime sendRaw preserves quit commands and exact matching', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const received: string[] = [];
  const handshake = await createRegisteredServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: handshake.port,
  }));

  try {
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    runtime.irc.sendRaw(network.id, 'QUITTER test');
    await waitFor(() => received.includes('QUITTER test'));
    assert.equal(received.includes('QUIT :Client disconnecting'), false);
    assert.equal(handshake.hasConnections(), true);

    runtime.irc.sendRaw(network.id, 'QUIT :Bye for now');
    await waitFor(() => received.includes('QUIT :Bye for now'));
    assert.equal(received.includes('QUIT :Client disconnecting'), false);
    await waitFor(() => !handshake.hasConnections());
  } finally {
    handshake.closeConnections();
    await new Promise<void>((resolve, reject) => handshake.server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('runtime streams structured channel list events from IRC LIST', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = new Runtime(storage.runtimeStore);
  const received: string[] = [];
  const listServer = await createListServer(received);
  const network = storage.upsertNetwork(createNetworkInput({
    host: '127.0.0.1',
    port: listServer.port,
  }));
  const socket = createSocketRecorder();

  try {
    runtime.gateway.attachSocket(socket);
    runtime.sessions.connect(network.id);
    await waitFor(() => runtime.gateway.snapshot().networkStates[network.id]?.phase === 'connected');

    const requestId = runtime.sessions.requestChannelList(network.id, socket);

    await waitFor(() => received.includes('LIST'));
    await waitFor(() => socket.sent.some((message) => message.type === 'channel.list.completed' && message.requestId === requestId));

    assert.ok(socket.sent.some((message) => message.type === 'channel.list.started' && message.requestId === requestId));
    assert.deepEqual(
      socket.sent
        .filter((message): message is Extract<ServerMessage, { type: 'channel.list.entry' }> => message.type === 'channel.list.entry')
        .map((message) => message.entry),
      [
        { name: '#help', users: 42, topic: 'Support room' },
        { name: '#ops', users: 7, topic: 'Operators' },
      ]
    );
  } finally {
    runtime.sessions.disconnect(network.id);
    listServer.closeConnections();
    await new Promise<void>((resolve, reject) => listServer.server.close((error) => (error ? reject(error) : resolve())));
  }
});
