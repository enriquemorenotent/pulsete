import type {
  AssistantPreferences,
  AssistantThreadSummary,
  BufferState,
  ChatMessage,
} from '../../shared/protocol.js';
import type {
  RuntimeAssistantStore,
  RuntimeConversationStore,
  RuntimeNetworkStore,
} from '../../server/runtime-store-ports.js';
import { resolveRuntimeMessageAttribution } from '../../server/message-attribution.js';

export const makeThread = (overrides: Partial<AssistantThreadSummary> = {}): AssistantThreadSummary => ({
  id: overrides.id ?? 'thread-1',
  bufferId: overrides.bufferId ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#general',
  scope: overrides.scope ?? 'buffer',
  title: overrides.title ?? 'Ask · #general',
  task: overrides.task ?? 'ask',
  model: overrides.model ?? 'gpt-5.4',
  turnStatus: overrides.turnStatus ?? null,
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
});

export const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'query',
  target: overrides.target ?? 'MissD',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

export const createAssistantStore = (
  initialThreads: AssistantThreadSummary[],
): RuntimeAssistantStore & {
  threads: Map<string, AssistantThreadSummary>;
  turns: Map<string, ReturnType<RuntimeAssistantStore['getThreadTurns']>>;
} => {
  let preferences: AssistantPreferences = { defaultModel: 'gpt-5.4', activeThreadId: null };
  const threads = new Map(initialThreads.map((thread) => [thread.id, thread]));
  const turns = new Map<string, ReturnType<RuntimeAssistantStore['getThreadTurns']>>();
  return {
    threads,
    turns,
    listThreads: () => [...threads.values()],
    getThread: (threadId) => threads.get(threadId) ?? null,
    getThreadTurns: (threadId) => turns.get(threadId) ?? [],
    saveThreadTurns: (threadId, nextTurns) => {
      turns.set(threadId, nextTurns);
    },
    upsertThread: (input) => {
      const previous = threads.get(input.id);
      const next = {
        ...previous,
        ...input,
        createdAt: input.createdAt ?? previous?.createdAt ?? Date.now(),
        updatedAt: input.updatedAt ?? previous?.updatedAt ?? Date.now(),
      };
      threads.set(next.id, next);
      return next;
    },
    removeThread: (threadId) => {
      threads.delete(threadId);
      if (preferences.activeThreadId === threadId) {
        preferences = { ...preferences, activeThreadId: null };
      }
    },
    getPreferences: () => preferences,
    savePreferences: (input) => {
      preferences = input;
      return input;
    },
  };
};

const parseSearchQueryTerms = (query: string) =>
  [...query.matchAll(/"([^"]+)"\*?|"([^"]+)"|([a-z0-9#@._-]+)\*?/gi)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? '')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0 && value !== 'and' && value !== 'or');

const scoreMessageForTerms = (message: ChatMessage, terms: string[]) => {
  const haystack = [message.nick ?? '', message.body, String(message.ts)].join(' ').toLowerCase();
  return terms.reduce((total, term) => total + (haystack.includes(term) ? Math.max(3, term.length) : 0), 0);
};

export const createConversationStore = (
  allMessages: ChatMessage[] = [],
  activeBuffer: BufferState | null = null,
): RuntimeConversationStore => {
  const messages = allMessages.map((message) => message.speakerRole
    ? message
    : ({ ...message, ...resolveRuntimeMessageAttribution(message) }));
  return {
    listBuffers: () => activeBuffer ? [activeBuffer] : [],
    listChannels: () => [],
    getBuffer: (bufferId) => activeBuffer && activeBuffer.id === bufferId ? activeBuffer : null,
    getBufferByTarget: () => activeBuffer,
    getServerBuffer: () => null,
    getChannelByName: () => null,
    markBufferRead: () => {},
    removeBuffer: () => null,
    deleteChannelByName: () => {},
    setBufferUnread: () => {},
    updateChannelUsers: () => {},
    updateChannelTopic: () => {},
    listMessages: (_networkId, _target, limit = 200) => messages.slice(-limit),
    listMessagePage: (_networkId, _target, limit) => ({ messages: messages.slice(-limit), hasMore: messages.length > limit }),
    listAllMessages: () => messages,
    listOpeningMessages: (_networkId, _target, limit) => messages.slice(0, limit),
    listRecentMessagesForBuffer: (_networkId, _target, limit) => messages.slice(-limit),
    getMessageWindow: (messageId, before, after) => {
      const index = messages.findIndex((message) => message.id === messageId);
      return index === -1 ? [] : messages.slice(Math.max(0, index - before), Math.min(messages.length, index + after + 1));
    },
    searchMessages: (_networkId, _target, query, limit) => messages
      .map((message) => ({ message, score: scoreMessageForTerms(message, parseSearchQueryTerms(query)) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.message.ts - right.message.ts)
      .slice(0, limit),
    deleteMessages: () => [],
    deleteMessagesByIdPrefixes: () => [],
    upsertChannel: () => { throw new Error('Not implemented in assistant-service test'); },
    upsertBuffer: () => { throw new Error('Not implemented in assistant-service test'); },
    upsertQuery: () => { throw new Error('Not implemented in assistant-service test'); },
    appendMessage: () => { throw new Error('Not implemented in assistant-service test'); },
    repairBufferMessageAttributions: () => [],
  };
};

export const conversationStore = createConversationStore();

export const networkStore: RuntimeNetworkStore = {
  list: () => [],
  get: () => null,
  getRuntime: () => null,
  upsert: () => { throw new Error('Not implemented in assistant-service test'); },
  saveWithRelatedInstances: () => { throw new Error('Not implemented in assistant-service test'); },
  deleteWithRelated: () => [],
};
