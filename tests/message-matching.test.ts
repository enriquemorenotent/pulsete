import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChatMessage } from '../shared/protocol.js';
import { matchesBufferMessage } from '../web/src/message-matching.js';

const queryBuffer: BufferState = {
  id: 'buffer-1',
  networkId: 'network-1',
  kind: 'query',
  target: 'Alice',
  unread: 0,
};

test('message matching treats IRC nick casing as the same private-message target', () => {
  const message: ChatMessage = {
    id: 'message-1',
    networkId: 'network-1',
    target: 'alice',
    nick: 'alice',
    body: 'hello',
    kind: 'line',
    self: false,
    ts: Date.now(),
  };

  assert.equal(matchesBufferMessage(queryBuffer, message), true);
});

test('message matching still respects the network id', () => {
  const message: ChatMessage = {
    id: 'message-2',
    networkId: 'network-2',
    target: 'alice',
    nick: 'alice',
    body: 'hello',
    kind: 'line',
    self: false,
    ts: Date.now(),
  };

  assert.equal(matchesBufferMessage(queryBuffer, message), false);
});
