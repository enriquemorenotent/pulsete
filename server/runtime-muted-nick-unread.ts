import type { BufferState } from '../shared/protocol-chat.js';
import type { RuntimeConversationStore } from './runtime-store.js';

export const collectChangedUnreadBuffers = (
  conversations: Pick<RuntimeConversationStore, 'listBuffers'>,
  previousBuffers: readonly BufferState[],
  networkId: string,
) => {
  const before = new Map(previousBuffers.map(buffer => [buffer.id, buffer]));
  return conversations.listBuffers(networkId).filter((buffer: BufferState) => {
    const previous = before.get(buffer.id);
    return previous?.unread !== buffer.unread || previous?.priorityUnread !== buffer.priorityUnread
      || previous?.firstUnreadMessageId !== buffer.firstUnreadMessageId;
  });
};
