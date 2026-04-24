import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createRuntimeEventHarness,
  messageBodies,
} from './helpers/runtime-conversation-event-helpers.js';
import { makeUser } from './helpers/runtime-test-common.js';

test('peer nick events append a channel notice for shared channels without a server fallback', () => {
  const harness = createRuntimeEventHarness();
  harness.storage.conversations.upsertChannel({
    id: randomUUID(),
    networkId: harness.network.id,
    name: '#help',
    topic: '',
    users: [makeUser('guide'), makeUser('alice')],
  });

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'helper',
    newNick: 'guide',
    self: false,
  });

  assert.deepEqual(messageBodies(harness, '#help'), ['helper is now known as guide']);
  assert.equal(messageBodies(harness, 'server').length, 0);
});

test('peer nick events append notices to both shared channels and an open private message', () => {
  const harness = createRuntimeEventHarness();
  harness.storage.conversations.upsertQuery(harness.network.id, 'helper');
  harness.storage.conversations.upsertChannel({
    id: randomUUID(),
    networkId: harness.network.id,
    name: '#help',
    topic: '',
    users: [makeUser('guide'), makeUser('alice')],
  });

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'helper',
    newNick: 'guide',
    self: false,
  });

  assert.deepEqual(messageBodies(harness, '#help'), ['helper is now known as guide']);
  assert.deepEqual(messageBodies(harness, 'guide'), ['helper is now known as guide']);
  assert.equal(messageBodies(harness, 'server').length, 0);
});

test('peer nick events fall back to the server buffer when no conversation context exists', () => {
  const harness = createRuntimeEventHarness();

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'helper',
    newNick: 'guide',
    self: false,
  });

  assert.deepEqual(messageBodies(harness, 'server'), ['helper is now known as guide']);
});

test('self nick events append a shared-channel notice without a server fallback', () => {
  const harness = createRuntimeEventHarness();
  harness.storage.conversations.upsertChannel({
    id: randomUUID(),
    networkId: harness.network.id,
    name: '#help',
    topic: '',
    users: [makeUser('guide'), makeUser('alice')],
  });

  harness.publishEvent({
    type: 'peer-nick',
    networkId: harness.network.id,
    oldNick: 'tester',
    newNick: 'guide',
    self: true,
  });

  assert.deepEqual(
    harness.storage.conversations.listMessages(harness.network.id, '#help', 10).map((message) => ({
      body: message.body,
      self: message.self,
    })),
    [{ body: 'tester is now known as guide', self: true }],
  );
  assert.equal(messageBodies(harness, 'server').length, 0);
});
