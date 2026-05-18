import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import {
  createNetworkInput,
  makeUser,
  setRuntimeConnection,
  waitFor,
} from './helpers/runtime-test-common.js';
import { createRegisteredServer } from './helpers/runtime-test-handshake-servers.js';
import { createListServer } from './helpers/runtime-test-list-servers.js';
import { createSocketRecorder } from './helpers/runtime-test-sockets.js';

test('runtime join defers channel persistence until the server confirms the join', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput());
  let requestedJoin: { channel: string; sourceTarget: string | undefined; visiblePending: boolean | undefined } | null = null;

  setRuntimeConnection(runtime, network.id, {
    join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }) {
      requestedJoin = { channel, sourceTarget, visiblePending: options?.visiblePending };
      return channel === '#missing';
    },
  });

  runtime.irc.join(network.id, '#missing');

  assert.deepEqual(requestedJoin, { channel: '#missing', sourceTarget: 'server', visiblePending: true });
  assert.equal(storage.conversations.getBufferByTarget(network.id, '#missing'), null);
  assert.equal(storage.conversations.getChannelByName(network.id, '#missing'), null);
});

test('runtime rejoins existing channel buffers without surfacing a pending channel row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput());
  const existing = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
    topic: 'saved topic',
    users: [makeUser('alice')],
  });

  let requestedJoin: { channel: string; sourceTarget: string | undefined; visiblePending: boolean | undefined } | null = null;

  setRuntimeConnection(runtime, network.id, {
    join(channel: string, sourceTarget?: string, options?: { visiblePending?: boolean }) {
      requestedJoin = { channel, sourceTarget, visiblePending: options?.visiblePending };
      return channel === '#help';
    },
  });

  runtime.irc.join(network.id, '#help');

  assert.deepEqual(requestedJoin, { channel: '#help', sourceTarget: 'server', visiblePending: false });
  assert.equal(storage.conversations.getBuffer(existing.id)?.kind, 'channel');
  assert.equal(storage.conversations.getChannelByName(network.id, '#help')?.topic, 'saved topic');
});

test('runtime validation rejects missing networks and invalid targets before touching storage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput({ workspaceOpen: true }));
  const query = storage.conversations.upsertQuery(network.id, 'helper');
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
  });

  assert.throws(() => runtime.irc.join('missing-network', '#help'), /Network not found/);
  assert.throws(() => runtime.irc.part('missing-network', '#help'), /Network not found/);
  assert.throws(() => runtime.conversations.closeBuffer('missing-buffer'), /Buffer not found/);
  assert.throws(() => runtime.mutedNicks.upsertMutedNick('missing-network', 'alice'), /Network not found/);
  assert.throws(() => runtime.irc.join(network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.throws(() => runtime.irc.join(network.id, '#help,#ops'), /Channel name must refer to a single channel/);
  assert.throws(() => runtime.irc.part(network.id, 'helper'), /Channel name must start with #, &, \+, or !/);
  assert.throws(() => runtime.conversations.openQuery(network.id, '   '), /Private-message target is required/);
  assert.throws(() => runtime.conversations.openQuery(network.id, '#help'), /Private-message target is required/);
  assert.throws(() => runtime.conversations.openQuery(network.id, 'alice,bob'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.conversations.openQuery(network.id, 'TESTER'), /Private-message target cannot be your own nick/);
  assert.throws(() => runtime.conversations.openQuery(network.id, 'tester_'), /Private-message target cannot be your own nick/);
  assert.throws(() => runtime.friends.upsertFriend('   '), /Private-message target is required/);
  assert.throws(() => runtime.friends.upsertFriend('#help'), /Private-message target is required/);
  assert.throws(() => runtime.friends.upsertFriend('alice,bob'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.mutedNicks.upsertMutedNick(network.id, '   '), /Private-message target is required/);
  assert.throws(() => runtime.mutedNicks.upsertMutedNick(network.id, '#help'), /Private-message target is required/);
  assert.throws(() => runtime.mutedNicks.upsertMutedNick(network.id, 'alice,bob'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.friends.removeFriend('missing-friend'), /Friend not found/);
  assert.throws(() => runtime.mutedNicks.removeMutedNick('missing-muted-nick'), /Muted nick not found/);
  const [removeMessage] = runtime.conversations.closeBuffer(channel.id).messages;
  assert.ok(removeMessage);
  if (removeMessage.type !== 'buffer.remove') {
    assert.fail(`Expected buffer.remove, received ${removeMessage.type}`);
  }
  assert.equal(removeMessage.networkId, network.id);
  assert.equal(removeMessage.bufferId, channel.id);
  assert.equal(storage.conversations.getChannelByName(network.id, '#help'), null);
  assert.equal(runtime.connections.has(network.id), false);
  assert.throws(
    () => runtime.conversations.closeBuffer(storage.conversations.getServerBuffer(network.id)!.id),
    /Only channels and private messages can be closed/
  );
  setRuntimeConnection(runtime, network.id, {
    get state() {
      return { phase: 'connected' as const, serverName: null, nick: 'renamed' };
    },
  });
  assert.throws(() => runtime.conversations.openQuery(network.id, 'RENAMED'), /Private-message target cannot be your own nick/);
  assert.throws(() => runtime.irc.sendMessage(network.id, '   ', 'hello'), /Private-message target is required/);
  assert.throws(() => runtime.irc.sendMessage(network.id, 'alice,bob', 'hello'), /Private-message target must refer to a single nick/);
  assert.throws(() => runtime.irc.sendMessage(network.id, 'renamed', 'hello'), /Private-message target cannot be your own nick/);
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

  assert.deepEqual(storage.conversations.listChannels(network.id), []);
  assert.equal(storage.conversations.getBuffer(query.id)?.target, 'helper');
  assert.deepEqual(storage.conversations.listMessages(network.id, 'server', 10), []);
});

test('runtime clears private-message history without closing the buffer', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertBuffer({
    networkId: network.id,
    kind: 'query',
    target: 'MissD',
    unread: 2,
    priorityUnread: 1,
    lastReadTs: 2,
    lastReadMessageId: 'message-2',
  });
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
  });
  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: 'MissD',
    nick: 'MissD',
    body: 'hello',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'message-2',
    networkId: network.id,
    target: 'MissD',
    nick: 'tester',
    body: 'hi',
    kind: 'line',
    self: true,
    ts: 2,
  });

  assert.throws(
    () => runtime.conversations.clearBufferHistory(channel.id),
    /Only private-message history can be deleted/,
  );
  const result = runtime.conversations.clearBufferHistory(query.id);
  const removeMessage = result.messages.find((message) => message.type === 'message.remove');
  const bufferMessage = result.messages.find((message) => message.type === 'buffer.upsert');

  if (!removeMessage || removeMessage.type !== 'message.remove') {
    assert.fail('Expected message.remove after clearing private-message history');
  }
  assert.equal(removeMessage.bufferId, query.id);
  assert.equal(removeMessage.networkId, network.id);
  assert.equal(removeMessage.target, 'MissD');
  assert.deepEqual([...removeMessage.messageIds].sort(), ['message-1', 'message-2']);
  if (!bufferMessage || bufferMessage.type !== 'buffer.upsert') {
    assert.fail('Expected buffer.upsert after clearing private-message history');
  }
  assert.equal(bufferMessage.buffer.id, query.id);
  assert.equal(storage.conversations.listMessages(network.id, 'MissD', 10).length, 0);
  assert.equal(storage.conversations.getBuffer(query.id)?.kind, 'query');
  assert.equal(storage.conversations.getBuffer(query.id)?.unread, 0);
  assert.equal(storage.conversations.getBuffer(query.id)?.priorityUnread, 0);
  assert.equal(storage.conversations.getBuffer(query.id)?.lastReadTs, null);
  assert.equal(storage.conversations.getBuffer(query.id)?.lastReadMessageId, null);
});

test('muting and unmuting recomputes unread counts for existing buffers immediately', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const network = storage.networks.upsert(createNetworkInput({
    nick: 'tester',
    altNicks: ['tester_'],
  }));
  const channel = storage.conversations.upsertChannel({
    networkId: network.id,
    name: '#help',
  });

  storage.conversations.appendMessage({
    id: 'message-1',
    networkId: network.id,
    target: '#help',
    nick: 'Alice',
    body: 'hello tester',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.setBufferUnread(channel.id, 1, 1);

  const muted = runtime.mutedNicks.upsertMutedNick(network.id, 'alice');

  assert.equal(storage.conversations.getBuffer(channel.id)?.unread, 0);
  assert.equal(storage.conversations.getBuffer(channel.id)?.priorityUnread, 0);
  assert.equal(muted.messages.some((message) => message.type === 'muted-nick.upsert'), true);
  assert.equal(muted.messages.some((message) => message.type === 'buffer.upsert'), true);

  const unmuted = runtime.mutedNicks.removeMutedNick(muted.mutedNick.id);

  assert.equal(storage.conversations.getBuffer(channel.id)?.unread, 1);
  assert.equal(storage.conversations.getBuffer(channel.id)?.priorityUnread, 1);
  assert.equal(unmuted.messages.some((message) => message.type === 'muted-nick.remove'), true);
  assert.equal(unmuted.messages.some((message) => message.type === 'buffer.upsert'), true);
});

test('runtime sendRaw preserves quit commands and exact matching', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const handshake = await createRegisteredServer(received);
  const network = storage.networks.upsert(createNetworkInput({
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
  const runtime = createRuntime(storage.runtimeStore);
  const received: string[] = [];
  const listServer = await createListServer(received);
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

    await waitFor(() => received.includes('LIST'));
    await waitFor(() => socket.sent.some((message) => message.type === 'channel.list.completed' && message.requestId === requestId));

    assert.ok(socket.sent.some((message) => message.type === 'channel.list.started' && message.requestId === requestId));
    assert.deepEqual(
      socket.sent
        .flatMap((message) =>
          message.type === 'channel.list.entries' && message.requestId === requestId ? message.entries : []
        ),
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
