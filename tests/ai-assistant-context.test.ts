import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAiAssistantContext, renderAiAssistantMessages } from '../server/ai-assistant-context.js';
import type { RuntimeConversationStore } from '../server/runtime-store-ports.js';
import type { BufferState, ChatMessage } from '../shared/protocol-chat.js';

const channelBuffer: BufferState = {
  id: 'buffer-1',
  kind: 'channel',
  lastReadMessageId: null,
  lastReadTs: null,
  networkId: 'network-1',
  priorityUnread: 0,
  target: '#lobby',
  unread: 0,
};

const message: ChatMessage = {
  body: 'Meet at the bridge',
  bufferId: channelBuffer.id,
  id: 'message-1',
  kind: 'line',
  networkId: channelBuffer.networkId,
  nick: 'Mira',
  self: false,
  target: channelBuffer.target,
  ts: Date.UTC(2026, 0, 1, 12, 0, 0),
};

test('assistant context includes recent messages for a channel buffer', () => {
  const store = createConversationStore(channelBuffer, [message]);
  const context = buildAiAssistantContext(store, channelBuffer.id);

  assert.deepEqual(context.buffer, {
    id: channelBuffer.id,
    kind: 'channel',
    networkId: channelBuffer.networkId,
    target: channelBuffer.target,
  });
  assert.deepEqual(context.messages, [message]);
});

test('assistant context rejects server buffers', () => {
  const store = createConversationStore({ ...channelBuffer, kind: 'server', target: 'server' }, []);
  assert.throws(
    () => buildAiAssistantContext(store, channelBuffer.id),
    /channels and private messages/,
  );
});

test('assistant message rendering keeps timestamps, speaker, and body', () => {
  assert.equal(
    renderAiAssistantMessages([message]),
    '[2026-01-01T12:00:00.000Z] Mira: Meet at the bridge',
  );
});

const createConversationStore = (
  buffer: BufferState | null,
  messages: ChatMessage[],
) => ({
  getBuffer: (bufferId: string) => buffer?.id === bufferId ? buffer : null,
  listRecentMessagesForBuffer: () => messages,
}) as unknown as RuntimeConversationStore;
