import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import type { RuntimeConversationStore } from './runtime-store.js';
import type { StorageDraftsRepository } from './storage-drafts-repository.js';

export const removedBufferMessages = (
  networkId: string,
  removedBufferIds: readonly string[],
  replacementBufferId: string,
  drafts: Pick<StorageDraftsRepository, 'get'>,
): ServerMessage[] => {
  const messages: ServerMessage[] = removedBufferIds.map((bufferId) => ({
    type: 'buffer.remove', networkId, bufferId, replacementBufferId,
  }));
  const draft = removedBufferIds.length > 0 ? drafts.get(replacementBufferId) : null;
  if (draft) messages.push({ type: 'draft.upsert', draft });
  return messages;
};

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
