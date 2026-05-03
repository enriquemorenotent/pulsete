import assert from 'node:assert/strict';
import test from 'node:test';
import { makeStorageFile, Storage } from './helpers/storage-test-helpers.js';
import type { NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: [],
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

test('snapshot keeps recent history for each open workspace buffer', () => {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  storage.conversations.upsertChannel({ networkId: network.id, name: '#quiet' });
  storage.conversations.upsertChannel({ networkId: network.id, name: '#busy' });
  storage.conversations.appendMessage({
    id: 'quiet-buffer-message',
    networkId: network.id,
    target: '#quiet',
    nick: 'alice',
    body: 'quiet buffer should survive a busy neighbor',
    kind: 'line',
    self: false,
    ts: 1,
  });
  for (let index = 0; index < 300; index += 1) {
    storage.conversations.appendMessage({
      id: `busy-buffer-message-${index}`,
      networkId: network.id,
      target: '#busy',
      nick: 'bob',
      body: `busy ${index}`,
      kind: 'line',
      self: false,
      ts: index + 2,
    });
  }

  const snapshot = storage.snapshot();
  assert(snapshot.messages.some((message) => message.id === 'quiet-buffer-message'));
  assert.equal(
    snapshot.messages.filter((message) => message.target === '#busy').length,
    250
  );
});
