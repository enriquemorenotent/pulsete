import type { AssistantAskRetrievalMemory } from '../shared/protocol.js';
import {
  openingMessageLimit,
  recentMessageLimit,
  spanScanLimit,
} from './assistant-ask-retrieval-constants.js';
import {
  buildFtsRetrievalMemory,
  buildLexicalSearchRetrievalMemory,
  buildProfileFactRetrievalMemory,
  buildSpanScanRetrievalMemory,
} from './assistant-ask-retrieval-results.js';
import {
  buildMessageWindowRetrievalMemory,
  buildOpeningRetrievalMemory,
  buildRecentRetrievalMemory,
} from './assistant-ask-retrieval-scans.js';
import { resolveAllMessages, resolveMessageWindow, resolveOpeningMessages, resolveRecentMessages } from './assistant-ask-retrieval-source.js';
import type { AssistantAskRetrievalInput } from './assistant-ask-retrieval-types.js';

export const resolveAssistantAskRetrieval = ({
  conversations,
  messages,
  request,
  subject,
}: AssistantAskRetrievalInput): AssistantAskRetrievalMemory => {
  if (request.operation === 'load_recent_buffer_messages') {
    return buildRecentRetrievalMemory(
      subject,
      resolveRecentMessages(subject, request.limit ?? recentMessageLimit, conversations, messages),
      request.limit,
    );
  }
  if (request.operation === 'load_opening_buffer_messages') {
    return buildOpeningRetrievalMemory(
      subject,
      resolveOpeningMessages(subject, request.limit ?? openingMessageLimit, conversations, messages),
      request.limit,
    );
  }
  if (request.operation === 'message_window') {
    return buildMessageWindowRetrievalMemory(
      subject,
      resolveMessageWindow(subject, request.messageId, request.before, request.after, conversations, messages),
      request,
    );
  }
  if (request.operation === 'profile_fact_search') {
    return buildProfileFactRetrievalMemory(subject, request, resolveAllMessages(subject, conversations, messages));
  }
  if (request.operation === 'span_scan') {
    return buildSpanScanRetrievalMemory(
      subject,
      resolveAllMessages(subject, conversations, messages),
      request.searchTerms,
      request.limit ?? spanScanLimit,
    );
  }
  if (request.operation === 'fts_search') {
    return buildFtsRetrievalMemory(subject, request, conversations, messages);
  }
  return buildLexicalSearchRetrievalMemory(
    subject,
    resolveAllMessages(subject, conversations, messages),
    request.searchTerms,
    request.limit,
  );
};

export const resolveAssistantAskRetrievedContext = (input: AssistantAskRetrievalInput) =>
  resolveAssistantAskRetrieval(input).context;
