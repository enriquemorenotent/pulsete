import { badRequest, notFound } from './app-error.js';
import { planAiAssistantRetrieval } from './ai-assistant-retrieval.js';
import { aiAssistantMessageLimit } from '../shared/protocol-ai.js';
import type { AiAssistantContext } from '../shared/protocol-ai.js';
import type { ChatMessage } from '../shared/protocol-chat.js';
import type { AiAssistantRequest } from '../shared/protocol-ai.js';
import type { RuntimeConversationStore } from './runtime-store.js';

type AiAssistantContextRequest = Pick<AiAssistantRequest, 'mode' | 'prompt'>
  & Partial<Pick<AiAssistantRequest, 'assistantTurns'>>;

export type AiAssistantPromptContext = AiAssistantContext & {
  fullLog: { messages: ChatMessage[] } | null;
  search: {
    messages: ChatMessage[];
    terms: string[];
  };
};

export const buildAiAssistantContext = (
  conversations: RuntimeConversationStore,
  bufferId: string,
  request: AiAssistantContextRequest = { mode: 'answer', prompt: '' },
): AiAssistantPromptContext => {
  const buffer = conversations.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  if (buffer.kind === 'server') {
    throw badRequest('Assistant is available in channels and private messages');
  }
  const recentMessages = conversations.listRecentMessagesForBuffer(
    buffer.networkId,
    buffer.target,
    aiAssistantMessageLimit,
  );
  const retrieval = planAiAssistantRetrieval({
    assistantTurns: request.assistantTurns ?? [],
    mode: request.mode,
    prompt: request.prompt,
  });
  const searchMessages = retrieveSearchMessages(conversations, buffer.id, retrieval.searchTerms);
  const includeFullLog = retrieval.includeFullLog || (
    retrieval.fullLogWhenSearchMisses
    && retrieval.searchTerms.length > 0
    && searchMessages.length === 0
  );
  return {
    buffer: {
      id: buffer.id,
      kind: buffer.kind,
      networkId: buffer.networkId,
      target: buffer.target,
    },
    fullLog: includeFullLog
      ? { messages: conversations.listAllMessages(buffer.networkId, buffer.target) }
      : null,
    messages: recentMessages,
    search: {
      messages: searchMessages,
      terms: retrieval.searchTerms,
    },
  };
};

export const toPublicAiAssistantContext = (
  context: AiAssistantPromptContext,
): AiAssistantContext => ({
  buffer: context.buffer,
  messages: context.messages,
});

export const renderAiAssistantContext = (context: AiAssistantPromptContext) =>
  [
    `Conversation: ${context.buffer.target} (${context.buffer.kind})`,
    'Recent saved messages:',
    renderAiAssistantMessages(context.messages) || '(none)',
    renderSearchSection(context),
    renderFullLogSection(context),
  ].filter(Boolean).join('\n\n');

export const renderAiAssistantMessages = (messages: readonly ChatMessage[]) =>
  messages.map(renderAiAssistantMessage).join('\n');

const renderAiAssistantMessage = (message: ChatMessage) => {
  const nick = message.speakerNick ?? message.nick ?? (message.self ? 'me' : 'unknown');
  return `[${new Date(message.ts).toISOString()}] ${nick}: ${message.body}`;
};

const retrieveSearchMessages = (
  conversations: RuntimeConversationStore,
  bufferId: string,
  terms: readonly string[],
) => dedupeMessages(
  terms.flatMap((term) =>
    conversations.searchMessagesByBufferId(bufferId, term, searchHitsPerTerm)
      .messages
      .flatMap((message) => conversations.getMessageWindow(
        message.id,
        searchWindowBefore,
        searchWindowAfter,
      )),
  ),
);

const renderSearchSection = (context: AiAssistantPromptContext) =>
  context.search.terms.length === 0
    ? ''
    : [
        `Targeted history search (${context.search.terms.join(', ')}):`,
        renderAiAssistantMessages(context.search.messages) || '(no matches)',
      ].join('\n');

const renderFullLogSection = (context: AiAssistantPromptContext) =>
  context.fullLog
    ? [
        'Full saved log for this conversation:',
        renderAiAssistantMessages(context.fullLog.messages) || '(none)',
      ].join('\n')
    : '';

const dedupeMessages = (messages: readonly ChatMessage[]) => {
  const byId = new Map<string, ChatMessage>();
  for (const message of messages) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => left.ts - right.ts);
};

const searchHitsPerTerm = 6;
const searchWindowAfter = 2;
const searchWindowBefore = 2;
