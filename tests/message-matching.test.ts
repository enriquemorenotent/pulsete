import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChatMessage } from '../shared/protocol-chat.js';
import { matchesBufferMessage } from '../web/src/message-matching.js';

const queryBuffer: BufferState = {
  id: 'buffer-1',
  networkId: 'network-1',
  kind: 'query',
  target: 'Alice',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

test('message matching treats IRC nick casing as the same private-message target', () => {
  const message: ChatMessage = {
    id: 'message-1',
    bufferId: queryBuffer.id,
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
    bufferId: 'buffer-2',
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
