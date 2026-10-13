import { badRequest, notFound } from './app-error.js';
import { readAssistantDateRange } from './ai-assistant-dates.js';
import { limitAssistantMessages } from './ai-assistant-context-budget.js';
import { planAiAssistantRetrieval } from './ai-assistant-retrieval.js';
import { aiAssistantMessageLimit } from '../shared/protocol-ai.js';
import type { AiAssistantContext } from '../shared/protocol-ai.js';
import type { ChatMessage } from '../shared/protocol-chat.js';
import type { AiAssistantRequest } from '../shared/protocol-ai.js';
import type { RuntimeConversationStore } from './runtime-store.js';

type AiAssistantContextRequest = Pick<AiAssistantRequest, 'mode' | 'prompt'>
  & Partial<Pick<AiAssistantRequest, 'assistantTurns' | 'scope'>>;

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
  const dateRange = readAssistantDateRange(request.prompt);
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
  const searchResult = request.scope === 'recent'
    ? { messages: [], hasMore: false }
    : retrieveSearchMessages(conversations, buffer.id, retrieval.searchTerms);
  const searchMessages = searchResult.messages;
  const includeFullLog = request.scope !== 'recent' && (request.scope === 'saved' || retrieval.includeFullLog || (
    retrieval.fullLogWhenSearchMisses
    && retrieval.searchTerms.length > 0
    && searchMessages.length === 0
  ));
  const history = includeFullLog
    ? conversations.listAssistantHistory(buffer.id, 600, dateRange)
    : null;
  const inRange = (messages: ChatMessage[]) => dateRange
    ? messages.filter((message) => message.ts >= dateRange.start && message.ts < dateRange.end)
    : messages;
  const recent = limitAssistantMessages(inRange(recentMessages), 8_000);
  const search = limitAssistantMessages(inRange(searchMessages), 8_000);
  const saved = history ? limitAssistantMessages(history.messages, 16_000) : null;
  const truncated = recent.truncated || search.truncated
    || Boolean(saved?.truncated || history?.hasMore || (!history && searchResult.hasMore));
  const sources = dedupeMessages([...recent.messages, ...search.messages, ...(saved?.messages ?? [])])
    .map((message, index) => ({ label: `S${index + 1}`, message }));
  return {
    coverage: {
      description: dateRange ? `${request.scope === 'recent' ? 'Recent' : 'Saved'} messages for ${dateRange.label} (local calendar day)`
        : history ? 'Saved conversation history' : request.scope === 'recent' ? 'Recent messages only' : 'Recent messages and matching history excerpts',
      truncated,
    },
    sources,
    buffer: {
      id: buffer.id,
      kind: buffer.kind,
      networkId: buffer.networkId,
      target: buffer.target,
    },
    fullLog: saved ? { messages: saved.messages } : null,
    messages: recent.messages,
    search: {
      messages: search.messages,
      terms: request.scope === 'recent' ? [] : retrieval.searchTerms,
    },
  };
};

export const toPublicAiAssistantContext = (
  context: AiAssistantPromptContext,
): AiAssistantContext => ({
  buffer: context.buffer,
  messages: context.messages,
  sources: context.sources,
  coverage: context.coverage,
});

export const renderAiAssistantContext = (context: AiAssistantPromptContext) =>
  [
    `Conversation: ${context.buffer.target} (${context.buffer.kind})`,
    `Coverage: ${context.coverage?.description}. ${context.coverage?.truncated
      ? 'INCOMPLETE: messages were omitted or shortened. Do not give exhaustive counts or claim absence.'
      : 'Only the supplied saved messages are evidence; unsaved conversation is unknown.'}`,
    'Recent saved messages:',
    renderContextMessages(context, context.messages) || '(none)',
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
) => {
  let hasMore = false;
  const messages = terms.flatMap((term) => {
    const page = conversations.searchMessagesByBufferId(bufferId, term, searchHitsPerTerm);
    hasMore ||= page.hasMore;
    return page.messages.flatMap((message) => conversations.getMessageWindow(
      message.id, searchWindowBefore, searchWindowAfter,
    ));
  });
  return { messages: dedupeMessages(messages), hasMore };
};

const renderSearchSection = (context: AiAssistantPromptContext) =>
  context.search.terms.length === 0
    ? ''
    : [
        `Targeted history search (${context.search.terms.join(', ')}):`,
        renderContextMessages(context, context.search.messages) || '(no matches)',
      ].join('\n');

const renderFullLogSection = (context: AiAssistantPromptContext) =>
  context.fullLog
    ? [
        context.coverage?.truncated ? 'Selected saved history (incomplete):' : 'Full saved log for this conversation:',
        renderContextMessages(context, context.fullLog.messages) || '(none)',
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

const renderContextMessages = (context: AiAssistantPromptContext, messages: readonly ChatMessage[]) =>
  messages.map((message) => {
    const label = context.sources?.find((source) => source.message.id === message.id)?.label;
    return `[${label ?? 'source'}] ${renderAiAssistantMessage(message)}`;
  }).join('\n');
