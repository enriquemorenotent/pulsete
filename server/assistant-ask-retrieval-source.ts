import type {
  AssistantActiveBuffer,
  ChatMessage,
} from '../shared/protocol.js';
import type { AssistantAskRetrievalConversations } from './assistant-ask-retrieval-types.js';

export const resolveOpeningMessages = (
  subject: AssistantActiveBuffer,
  limit: number,
  conversations?: AssistantAskRetrievalConversations,
  messages?: ChatMessage[],
) => conversations
  ? conversations.listOpeningMessages(subject.networkId, subject.target, limit)
  : resolveAllMessages(subject, conversations, messages).slice(0, Math.max(1, limit));

export const resolveRecentMessages = (
  subject: AssistantActiveBuffer,
  limit: number,
  conversations?: AssistantAskRetrievalConversations,
  messages?: ChatMessage[],
) => conversations
  ? conversations.listRecentMessagesForBuffer(subject.networkId, subject.target, limit)
  : resolveAllMessages(subject, conversations, messages).slice(-Math.max(1, limit));

export const resolveMessageWindow = (
  subject: AssistantActiveBuffer,
  messageId: string,
  before: number,
  after: number,
  conversations?: AssistantAskRetrievalConversations,
  messages?: ChatMessage[],
) => {
  if (conversations) {
    return conversations.getMessageWindow(messageId, before, after);
  }
  const allMessages = resolveAllMessages(subject, conversations, messages);
  const index = allMessages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return [];
  }
  return allMessages.slice(Math.max(0, index - before), Math.min(allMessages.length, index + after + 1));
};

export const resolveAllMessages = (
  subject: AssistantActiveBuffer,
  conversations?: AssistantAskRetrievalConversations,
  messages?: ChatMessage[],
) => messages ?? conversations?.listAllMessages(subject.networkId, subject.target) ?? [];
