import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol-chat.js';
import { loadOlderBufferHistory } from '../web/src/transcript/history.js';

const message: ChatMessage = {
  id: 'message-1',
  bufferId: 'buffer-1',
  networkId: 'network-1',
  target: '#help',
  nick: 'alice',
  body: 'hello',
  kind: 'line',
  self: false,
  ts: 1,
};

test('loadOlderBufferHistory skips requests when no retained message capacity remains', async () => {
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];
  let loaded = false;

  const prependedCount = await loadOlderBufferHistory({
    beforeMessageId: message.id,
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    remainingMessageCapacity: 0,
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => {
      loaded = true;
      return { messages: [], hasMore: true };
    },
    isCurrentRequest: () => true,
  });

  assert.equal(prependedCount, 0);
  assert.equal(loaded, false);
  assert.deepEqual(dispatched, []);
});

test('loadOlderBufferHistory ignores a response after the selected buffer changes', async () => {
  const dispatched: Array<{ type: string; [key: string]: unknown }> = [];

  const prependedCount = await loadOlderBufferHistory({
    beforeMessageId: message.id,
    bufferId: 'buffer-1',
    gatewayStatus: 'connected',
    remainingMessageCapacity: 1,
    dispatch: (action) => {
      dispatched.push(action);
    },
    loadHistory: async () => ({ messages: [message], hasMore: false }),
    isCurrentRequest: () => false,
  });

  assert.equal(prependedCount, 0);
  assert.deepEqual(dispatched, []);
});
