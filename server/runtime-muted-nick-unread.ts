import type { BufferState, MutedNickState } from '../shared/protocol-chat.js';
import { isNickMuted } from '../shared/muted-nicks.js';
import { resolveNextBufferActivity } from './runtime-buffer-activity.js';
import type { RuntimeConversationStore, RuntimeNetworkStore } from './runtime-store-ports.js';
import type { MessageInput } from './storage-types.js';

const resolveMessageMuted = (mutedNicks: readonly MutedNickState[], message: MessageInput) =>
  isNickMuted(mutedNicks, message.networkId, message.nick);

const findFirstUnreadIndex = (messages: readonly MessageInput[], buffer: BufferState) => {
  if (buffer.lastReadMessageId) {
    const cursorIndex = messages.findIndex((message) => message.id === buffer.lastReadMessageId);
    if (cursorIndex >= 0) {
      return cursorIndex + 1;
    }
  }
  const lastReadTs = buffer.lastReadTs;
  if (lastReadTs == null) {
    return 0;
  }
  return messages.findIndex((message) => message.ts > lastReadTs);
};

export const recomputeMutedNickUnread = (
  conversations: Pick<RuntimeConversationStore, 'listBuffers' | 'listAllMessages' | 'setBufferUnread'>,
  networks: Pick<RuntimeNetworkStore, 'get'>,
  mutedNicks: readonly MutedNickState[],
  networkId: string,
) => {
  const network = networks.get(networkId);
  const changedBuffers: BufferState[] = [];
  for (const buffer of conversations.listBuffers(networkId)) {
    const messages = conversations.listAllMessages(buffer.networkId, buffer.target);
    const firstUnreadIndex = findFirstUnreadIndex(messages, buffer);
    const slice = firstUnreadIndex < 0 ? [] : messages.slice(firstUnreadIndex);
    const nextBuffer = slice.reduce(
      (currentBuffer, message) =>
        resolveNextBufferActivity({
          buffer: currentBuffer,
          message,
          currentNick: network?.nick ?? null,
          altNicks: network?.altNicks ?? [],
          messageMuted: resolveMessageMuted(mutedNicks, message),
        }),
      { ...buffer, unread: 0, priorityUnread: 0 },
    );
    if (nextBuffer.unread === buffer.unread && nextBuffer.priorityUnread === buffer.priorityUnread) {
      continue;
    }
    conversations.setBufferUnread(buffer.id, nextBuffer.unread, nextBuffer.priorityUnread);
    changedBuffers.push({ ...buffer, unread: nextBuffer.unread, priorityUnread: nextBuffer.priorityUnread });
  }
  return changedBuffers;
};
