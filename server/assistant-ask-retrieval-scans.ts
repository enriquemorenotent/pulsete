import type {
  AssistantActiveBuffer,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
  ChatMessage,
} from '../shared/protocol.js';
import { formatTimestamp } from './assistant-history-context.js';
import { buildEvidenceGroups, renderEvidenceGroupsContext } from './assistant-ask-evidence.js';
import { createRetrievalMemory } from './assistant-ask-retrieval-memory.js';

export const buildRecentRetrievalMemory = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  limit: number,
): AssistantAskRetrievalMemory => buildScanRetrievalMemory(
  subject,
  { operation: 'load_recent_buffer_messages', limit },
  'recent_scan',
  'load_recent_buffer_messages',
  messages,
);

export const buildOpeningRetrievalMemory = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  limit: number,
): AssistantAskRetrievalMemory => buildScanRetrievalMemory(
  subject,
  { operation: 'load_opening_buffer_messages', limit },
  'opening_scan',
  'load_opening_buffer_messages',
  messages,
);

export const buildMessageWindowRetrievalMemory = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  request: Extract<AssistantAskRetrievalRequest, { operation: 'message_window' }>,
): AssistantAskRetrievalMemory => {
  const evidenceGroups = buildEvidenceGroups(messages);
  const contextLines = messages.length === 0
    ? [
        `Retrieved transcript context for ${subject.title}:`,
        `Operation: message_window(messageId=${request.messageId}, before=${request.before}, after=${request.after})`,
        'The requested message window could not be loaded.',
      ]
    : [
        `Retrieved transcript context for ${subject.title}:`,
        `Operation: message_window(messageId=${request.messageId}, before=${request.before}, after=${request.after})`,
        '',
        renderEvidenceGroupsContext(evidenceGroups),
      ];
  return createRetrievalMemory({
    subject,
    request,
    stage: 'message_window',
    query: request.messageId,
    confidence: messages.length > 0 ? 0.8 : 0,
    scoreSummary: `messages=${messages.length}`,
    contextLines,
    matchCount: messages.length,
    matchedMessageIds: messages.map((message) => message.id),
    windowMessageIds: [messages.map((message) => message.id)],
    evidenceMessageIds: messages.map((message) => message.id),
    evidenceGroups,
  });
};

const buildScanRetrievalMemory = (
  subject: AssistantActiveBuffer,
  request: Extract<AssistantAskRetrievalRequest, { operation: 'load_recent_buffer_messages' | 'load_opening_buffer_messages' }>,
  stage: 'recent_scan' | 'opening_scan',
  operationLabel: 'load_recent_buffer_messages' | 'load_opening_buffer_messages',
  messages: ChatMessage[],
) => {
  const evidenceGroups = buildEvidenceGroups(messages);
  const contextLines = messages.length === 0
    ? [
        `Retrieved transcript context for ${subject.title}:`,
        `Operation: ${operationLabel}(limit=${request.limit})`,
        'No stored messages are available in this buffer.',
      ]
    : [
        `Retrieved transcript context for ${subject.title}:`,
        `Operation: ${operationLabel}(limit=${request.limit})`,
        `Coverage: ${formatTimestamp(messages[0]!.ts)} to ${formatTimestamp(messages.at(-1)!.ts)}`,
        `Messages returned: ${messages.length}`,
        '',
        renderEvidenceGroupsContext(evidenceGroups),
      ];
  return createRetrievalMemory({
    subject,
    request,
    stage,
    query: '',
    confidence: messages.length === 0 ? 0 : 0.92,
    scoreSummary: messages.length === 0 ? 'no messages available' : `messages=${messages.length}`,
    contextLines,
    matchCount: messages.length,
    matchedMessageIds: messages.map((message) => message.id),
    windowMessageIds: [messages.map((message) => message.id)],
    evidenceMessageIds: messages.map((message) => message.id),
    evidenceGroups,
  });
};
