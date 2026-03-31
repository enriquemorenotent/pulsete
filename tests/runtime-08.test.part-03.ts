import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { Storage } from '../server/storage.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

test('peer nick events retarget an open private message buffer and preserve transcript continuity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const query = storage.conversations.upsertQuery(network.id, 'helper');
  storage.conversations.appendMessage({
    id: 'before-nick-change',
    networkId: network.id,
    target: 'helper',
    nick: 'helper',
    body: 'before rename',
    kind: 'line',
    self: false,
    ts: 1,
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'peer-nick',
      networkId: network.id,
      oldNick: 'helper',
      newNick: 'guide',
      self: false,
    }
  );

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'message',
      message: {
        id: randomUUID(),
        networkId: network.id,
        target: 'guide',
        nick: 'guide',
        body: 'after rename',
        kind: 'line',
        self: false,
        ts: 2,
      },
    }
  );

  assert.equal(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);
  assert.equal(storage.conversations.getBufferByTarget(network.id, 'guide')?.id, query.id);
  assert.equal(storage.conversations.getBufferByTarget(network.id, 'helper'), null);
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'guide', 10).map((message) => ({
      target: message.target,
      body: message.body,
    })),
    [
      { target: 'guide', body: 'before rename' },
      { target: 'guide', body: 'after rename' },
    ],
  );
  assert.ok(
    sent.some(
      (message) =>
        message.type === 'buffer.upsert'
        && (message.buffer as { id?: string; target?: string } | undefined)?.id === query.id
        && (message.buffer as { target?: string } | undefined)?.target === 'guide'
    )
  );
});

test('peer nick events merge an existing destination query buffer into the original private message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-runtime-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  const originalQuery = storage.conversations.upsertQuery(network.id, 'helper');
  const renamedQuery = storage.conversations.upsertQuery(network.id, 'guide');
  storage.conversations.setBufferUnread(originalQuery.id, 1, 1);
  storage.conversations.setBufferUnread(renamedQuery.id, 2, 0);
  storage.conversations.appendMessage({
    id: 'old-query-message',
    networkId: network.id,
    target: 'helper',
    nick: 'helper',
    body: 'old buffer',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'new-query-message',
    networkId: network.id,
    target: 'guide',
    nick: 'guide',
    body: 'new buffer',
    kind: 'line',
    self: false,
    ts: 2,
  });
  const sent: Array<{ type: string; [key: string]: unknown }> = [];

  handleRuntimeEvent(
    { store: storage, publish(message) { sent.push(message); } },
    {
      type: 'peer-nick',
      networkId: network.id,
      oldNick: 'helper',
      newNick: 'guide',
      self: false,
    }
  );

  assert.equal(storage.conversations.listBuffers(network.id).filter((buffer) => buffer.kind === 'query').length, 1);
  assert.equal(storage.conversations.getBufferByTarget(network.id, 'guide')?.id, originalQuery.id);
  assert.equal(storage.conversations.getBuffer(renamedQuery.id), null);
  assert.equal(storage.conversations.getBuffer(originalQuery.id)?.unread, 3);
  assert.equal(storage.conversations.getBuffer(originalQuery.id)?.priorityUnread, 1);
  assert.deepEqual(
    storage.conversations.listMessages(network.id, 'guide', 10).map((message) => message.body),
    ['old buffer', 'new buffer'],
  );
  assert.deepEqual(sent.find((message) => message.type === 'buffer.remove'), {
    type: 'buffer.remove',
    networkId: network.id,
    bufferId: renamedQuery.id,
  });
});
