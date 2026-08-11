import { badRequest, notFound } from './app-error.js';
import { historyWindowLimit, type PinnedMessageHistoryWindowPayload } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { getRequiredBuffer } from './runtime-conversation-store-helpers.js';
import type { RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';

const historyBeforeTarget = Math.floor((historyWindowLimit - 1) / 2);
const historyAfterTarget = historyWindowLimit - historyBeforeTarget - 1;

export const listRuntimePinnedMessages = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
) => {
  requireQueryBuffer(options, bufferId);
  return { messages: options.conversations.listPinnedMessages(bufferId) };
};

export const setRuntimeMessagePinned = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  messageId: string,
  pinned: boolean,
) => {
  requirePinnableMessage(options, bufferId, messageId);
  const message = options.conversations.setMessagePinned(messageId, pinned);
  if (!message) {
    throw notFound('Message not found');
  }
  return {
    message,
    messages: [{ type: 'message.pin.updated', message } satisfies ServerMessage],
  };
};

export const getRuntimePinnedMessageHistoryWindow = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  messageId: string,
): PinnedMessageHistoryWindowPayload => {
  const message = requirePinnableMessage(options, bufferId, messageId);
  if (message.pinnedAt == null) {
    throw notFound('Pinned message not found');
  }
  const page = options.conversations.getMessageWindowPage(
    messageId,
    historyBeforeTarget,
    historyAfterTarget,
  );
  if (!page) {
    throw notFound('Message not found');
  }
  return {
    messages: page.messages,
    targetMessageId: messageId,
    hasOlder: page.hasMore,
    hasNewer: page.hasNewer,
  };
};

const requireQueryBuffer = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
) => {
  const buffer = getRequiredBuffer(options.conversations, bufferId);
  if (buffer.kind !== 'query') {
    throw badRequest('Only private-message text and action messages can be pinned');
  }
  return buffer;
};

const requirePinnableMessage = (
  options: RuntimeConversationServiceOptions,
  bufferId: string,
  messageId: string,
) => {
  const buffer = requireQueryBuffer(options, bufferId);
  const message = options.conversations.getMessageById(messageId);
  if (!message || message.bufferId !== buffer.id) {
    throw notFound('Message not found in private message');
  }
  if (message.kind !== 'line' && message.kind !== 'action') {
    throw badRequest('Only text and action messages can be pinned');
  }
  return message;
};
