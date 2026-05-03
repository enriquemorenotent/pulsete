import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { markSelectedBufferRead } from '../web/src/transcript/read-receipt.js';

const buffer: BufferState = {
  id: 'buffer-1',
  networkId: 'network-1',
  kind: 'channel',
  target: '#help',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: 1,
  lastReadMessageId: 'message-1',
};

const serverMessage: ServerMessage = {
  type: 'notice',
  networkId: 'network-1',
  message: 'read',
};

test('markSelectedBufferRead applies messages for the current request', async () => {
  const controller = new AbortController();
  const appliedMessages: ServerMessage[][] = [];
  let settled = 0;
  let receivedSignal: AbortSignal | undefined;

  await markSelectedBufferRead({
    bufferId: buffer.id,
    signal: controller.signal,
    applyServerMessages: (messages) => {
      appliedMessages.push([...messages]);
    },
    markBufferRead: async (bufferId, init) => {
      assert.equal(bufferId, buffer.id);
      receivedSignal = init?.signal ?? undefined;
      return { buffer, messages: [serverMessage] };
    },
    isCurrentRequest: () => true,
    onSettled: () => {
      settled += 1;
    },
  });

  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(appliedMessages, [[serverMessage]]);
  assert.equal(settled, 1);
});

test('markSelectedBufferRead ignores stale completions', async () => {
  const controller = new AbortController();
  const appliedMessages: ServerMessage[][] = [];
  let settled = 0;
  let resolveRead!: (value: { buffer: BufferState; messages: ServerMessage[] }) => void;
  const pendingRead = new Promise<{ buffer: BufferState; messages: ServerMessage[] }>((resolve) => {
    resolveRead = resolve;
  });
  let current = true;

  const marking = markSelectedBufferRead({
    bufferId: buffer.id,
    signal: controller.signal,
    applyServerMessages: (messages) => {
      appliedMessages.push([...messages]);
    },
    markBufferRead: async () => pendingRead,
    isCurrentRequest: () => current,
    onSettled: () => {
      settled += 1;
    },
  });

  current = false;
  controller.abort();
  resolveRead({ buffer, messages: [serverMessage] });
  await marking;

  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(appliedMessages, []);
  assert.equal(settled, 0);
});
