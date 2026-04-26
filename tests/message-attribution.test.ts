import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getTranscriptSpeakerLabel } from '../shared/message-speaker.js';
import {
  normalizeStoredAttribution,
  resolveRuntimeMessageAttribution,
} from '../server/message-attribution.js';
import { Storage, type NetworkInput } from '../server/storage.js';

const createNetworkInput = (overrides: Partial<NetworkInput> = {}) => ({
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester Example',
  favorite: false,
  autoJoin: [],
  ...overrides,
});

const createStorage = () => {
  const storage = new Storage(join(mkdtempSync(join(tmpdir(), 'pulsete-storage-')), 'db.sqlite'));
  const network = storage.networks.upsert(createNetworkInput());
  return { network, storage };
};

test('runtime attribution classifies self, peer, channel, and ambiguous speakers conservatively', () => {
  assert.deepEqual(resolveRuntimeMessageAttribution({
    kind: 'line',
    nick: 'tester',
    self: true,
    target: 'MissD',
  }), {
    speakerRole: 'self',
    speakerNick: 'tester',
    attributionSource: 'runtime',
    attributionConfidence: 'high',
    self: true,
  });
  assert.equal(resolveRuntimeMessageAttribution({
    kind: 'line',
    nick: 'MissD',
    self: false,
    target: 'missd',
  }).speakerRole, 'peer');
  assert.equal(resolveRuntimeMessageAttribution({
    kind: 'line',
    nick: 'opal',
    self: false,
    target: '#help',
  }).speakerRole, 'other');
  assert.equal(resolveRuntimeMessageAttribution({
    kind: 'system',
    nick: 'opal',
    self: false,
    target: '#help',
  }).speakerRole, 'unknown');
  assert.equal(resolveRuntimeMessageAttribution({
    kind: 'line',
    nick: 'NickServ',
    self: false,
    target: 'server',
  }).speakerRole, 'unknown');
  assert.equal(resolveRuntimeMessageAttribution({
    kind: 'line',
    nick: null,
    self: false,
    target: 'MissD',
  }).speakerRole, 'unknown');
});

test('stored attribution preserves explicit self and peer decisions', () => {
  assert.deepEqual(normalizeStoredAttribution({
    nick: 'oldsofia',
    self: false,
    speakerRole: 'self',
    speakerNick: 'oldsofia',
    attributionSource: 'import-alias',
    attributionConfidence: 'high',
  }), {
    speakerRole: 'self',
    speakerNick: 'oldsofia',
    attributionSource: 'import-alias',
    attributionConfidence: 'high',
    self: true,
  });
  assert.deepEqual(normalizeStoredAttribution({
    nick: 'oldsofia',
    self: false,
    speakerRole: 'peer',
    speakerNick: 'oldsofia',
    attributionSource: 'query-target',
    attributionConfidence: 'high',
  }), {
    speakerRole: 'peer',
    speakerNick: 'oldsofia',
    attributionSource: 'query-target',
    attributionConfidence: 'high',
    self: false,
  });
});

test('stored explicit attribution beats target-based runtime guessing', () => {
  const { network, storage } = createStorage();
  storage.conversations.appendMessage({
    id: 'explicit-unknown',
    networkId: network.id,
    target: 'MissD',
    nick: 'MissD',
    speakerRole: 'unknown',
    speakerNick: 'MissD',
    attributionSource: 'unknown',
    attributionConfidence: 'low',
    body: 'ambiguous import row',
    kind: 'line',
    self: false,
    ts: 1,
  });
  storage.conversations.appendMessage({
    id: 'explicit-self',
    networkId: network.id,
    target: 'MissD',
    nick: 'oldsofia',
    speakerRole: 'self',
    speakerNick: 'oldsofia',
    attributionSource: 'import-alias',
    attributionConfidence: 'high',
    body: 'old self row',
    kind: 'line',
    self: false,
    ts: 2,
  });

  const messages = storage.conversations.listMessages(network.id, 'MissD', 10);

  assert.equal(messages[0]?.speakerRole, 'unknown');
  assert.equal(messages[0]?.self, false);
  assert.equal(messages[1]?.speakerRole, 'self');
  assert.equal(messages[1]?.self, true);
  assert.equal(messages[1] ? getTranscriptSpeakerLabel(messages[1]) : null, 'you');
});

test('runtime server messages with service nicks stay unknown', () => {
  const { network, storage } = createStorage();
  storage.conversations.appendMessage({
    id: 'service-message',
    networkId: network.id,
    target: 'server',
    nick: 'NickServ',
    body: 'Use IDENTIFY first',
    kind: 'line',
    self: false,
    ts: 1,
  });

  const message = storage.conversations.listMessages(network.id, 'server', 10)[0];

  assert.equal(message?.speakerRole, 'unknown');
  assert.equal(message?.speakerNick, 'NickServ');
  assert.equal(message?.attributionConfidence, 'low');
  assert.equal(message?.self, false);
});
