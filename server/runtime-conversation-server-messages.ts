import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import type { RuntimeConversationStore } from './runtime-store.js';

export const removedBufferMessages = (
  networkId: string,
  removedBufferIds: readonly string[],
  replacementBufferId: string,
): ServerMessage[] => removedBufferIds.map((bufferId) => ({
  type: 'buffer.remove',
  networkId,
  bufferId,
  replacementBufferId,
}));

export const appendMissedNickChangeMessage = (
  conversations: Pick<RuntimeConversationStore, 'appendMessage'>,
  message: ChatMessage,
  retargetedFrom?: string | null,
) => {
  if (!retargetedFrom || message.self || isSameIrcIdentifier(retargetedFrom, message.target)) {
    return null;
  }
  return conversations.appendMessage({
    id: randomUUID(),
    networkId: message.networkId,
    target: message.target,
    nick: null,
    body: `${retargetedFrom} is now known as ${message.target}`,
    kind: 'system',
    self: false,
    ts: Math.max(0, message.ts - 1),
  });
};
