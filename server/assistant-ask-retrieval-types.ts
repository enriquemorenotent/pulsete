import type {
  AssistantActiveBuffer,
  AssistantAskRetrievalRequest,
  ChatMessage,
} from '../shared/protocol.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';

export type AssistantAskRetrievalConversations = Pick<
  RuntimeConversationStore,
  'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
>;

export type AssistantAskRetrievalInput = {
  conversations?: AssistantAskRetrievalConversations;
  messages?: ChatMessage[];
  request: AssistantAskRetrievalRequest;
  subject: AssistantActiveBuffer;
};

export type RetrievalWindow = {
  messageIds: string[];
  messages: ChatMessage[];
  score: number;
};

export type RetrievalRangeWindow = RetrievalWindow & {
  start: number;
  end: number;
};

export type SearchHit = {
  message: ChatMessage;
  score: number;
};

export type ProfileFactCandidateWindow = RetrievalWindow & {
  matchedMessageIds: string[];
  strategy: 'qa_pair' | 'lexical_fallback';
};
