import type {
  AssistantActiveBuffer,
  AssistantAskEvidenceLine,
  AssistantAskEvidenceGroup,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
  ChatMessage,
} from '../shared/protocol.js';
import { getTranscriptSpeakerLabel } from '../shared/message-speaker.js';
import {
  formatTimestamp,
  matchesTerm,
  termWeight,
} from './assistant-history-context.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';

const recentMessageLimit = 40;
const openingMessageLimit = 40;
const messageWindowRadius = 8;
const spanScanLimit = 3;
const spanScanWindowSize = 28;
const spanScanStride = 14;
const searchEvidenceMessageLimit = 10;
const evidenceNeighborMaxGapMs = 15 * 60_000;
const profileFactAnswerWindow = 3;

type RetrievalWindow = {
  messageIds: string[];
  messages: ChatMessage[];
  score: number;
};

type SearchHit = {
  message: ChatMessage;
  score: number;
};

type ProfileFactCandidateWindow = RetrievalWindow & {
  matchedMessageIds: string[];
  strategy: 'qa_pair' | 'lexical_fallback';
};

export const resolveAssistantAskRetrieval = ({
  conversations,
  messages,
  request,
  subject,
}: {
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >;
  messages?: ChatMessage[];
  request: AssistantAskRetrievalRequest;
  subject: AssistantActiveBuffer;
}): AssistantAskRetrievalMemory => {
  if (request.operation === 'load_recent_buffer_messages') {
    return renderRecentMessages(subject, resolveRecentMessages(subject, request.limit, conversations, messages), request.limit);
  }
  if (request.operation === 'load_opening_buffer_messages') {
    return renderOpeningMessages(subject, resolveOpeningMessages(subject, request.limit, conversations, messages), request.limit);
  }
  if (request.operation === 'profile_fact_search') {
    return renderProfileFactSearchResults(subject, request, conversations, messages);
  }
  if (request.operation === 'message_window') {
    return renderMessageWindow(subject, resolveMessageWindow(subject, request.messageId, request.before, request.after, conversations, messages), request);
  }
  if (request.operation === 'span_scan') {
    return renderSpanScanResults(subject, resolveAllMessages(subject, conversations, messages), request.searchTerms, request.limit);
  }
  if (request.operation === 'fts_search') {
    return renderFtsSearchResults(subject, request, conversations, messages);
  }
  return renderLexicalSearchResults(subject, resolveAllMessages(subject, conversations, messages), request.searchTerms, request.limit);
};

export const resolveAssistantAskRetrievedContext = (input: {
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >;
  messages?: ChatMessage[];
  request: AssistantAskRetrievalRequest;
  subject: AssistantActiveBuffer;
}) => resolveAssistantAskRetrieval(input).context;

const renderRecentMessages = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  limit: number,
): AssistantAskRetrievalMemory => {
  const evidenceMessages = messages;
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  if (messages.length === 0) {
    return {
      subject,
      request: {
        operation: 'load_recent_buffer_messages',
        limit,
      },
      stage: 'recent_scan',
      query: '',
      confidence: 0,
      scoreSummary: 'no messages available',
      context: [
        `Retrieved transcript context for ${subject.title}:`,
        `Operation: load_recent_buffer_messages(limit=${limit})`,
        'No stored messages are available in this buffer.',
      ].join('\n'),
      matchCount: 0,
      matchedMessageIds: [],
      windowMessageIds: [],
      evidenceMessageIds: [],
      evidenceGroups: evidenceGroups,
    };
  }
  return {
    subject,
    request: {
      operation: 'load_recent_buffer_messages',
      limit,
    },
    stage: 'recent_scan',
    query: '',
    confidence: 0.92,
    scoreSummary: `messages=${messages.length}`,
    context: [
      `Retrieved transcript context for ${subject.title}:`,
      `Operation: load_recent_buffer_messages(limit=${limit})`,
      `Coverage: ${formatTimestamp(messages[0]!.ts)} to ${formatTimestamp(messages.at(-1)!.ts)}`,
      `Messages returned: ${messages.length}`,
      '',
      renderEvidenceGroupsContext(evidenceGroups),
    ].join('\n'),
    matchCount: messages.length,
    matchedMessageIds: messages.map((message) => message.id),
    windowMessageIds: [messages.map((message) => message.id)],
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  };
};

const renderOpeningMessages = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  limit: number,
): AssistantAskRetrievalMemory => {
  const evidenceMessages = messages;
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  if (messages.length === 0) {
    return {
      subject,
      request: {
        operation: 'load_opening_buffer_messages',
        limit,
      },
      stage: 'opening_scan',
      query: '',
      confidence: 0,
      scoreSummary: 'no messages available',
      context: [
        `Retrieved transcript context for ${subject.title}:`,
        `Operation: load_opening_buffer_messages(limit=${limit})`,
        'No stored messages are available in this buffer.',
      ].join('\n'),
      matchCount: 0,
      matchedMessageIds: [],
      windowMessageIds: [],
      evidenceMessageIds: [],
      evidenceGroups,
    };
  }
  return {
    subject,
    request: {
      operation: 'load_opening_buffer_messages',
      limit,
    },
    stage: 'opening_scan',
    query: '',
    confidence: 0.92,
    scoreSummary: `messages=${messages.length}`,
    context: [
      `Retrieved transcript context for ${subject.title}:`,
      `Operation: load_opening_buffer_messages(limit=${limit})`,
      `Coverage: ${formatTimestamp(messages[0]!.ts)} to ${formatTimestamp(messages.at(-1)!.ts)}`,
      `Messages returned: ${messages.length}`,
      '',
      renderEvidenceGroupsContext(evidenceGroups),
    ].join('\n'),
    matchCount: messages.length,
    matchedMessageIds: messages.map((message) => message.id),
    windowMessageIds: [messages.map((message) => message.id)],
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  };
};

const renderFtsSearchResults = (
  subject: AssistantActiveBuffer,
  request: Extract<AssistantAskRetrievalRequest, { operation: 'fts_search' }>,
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
  messages?: ChatMessage[],
): AssistantAskRetrievalMemory => {
  const hits = searchTranscript(subject, request.query, request.searchTerms, request.limit, conversations, messages);
  const windows = rankEvidenceWindows(
    buildEvidenceWindows(subject, hits, request.searchTerms, conversations, messages),
    request.searchTerms,
  ).slice(0, 3);
  const evidenceMessages = collectRelevantEvidenceMessages(
    windows,
    hits.map((hit) => hit.message.id),
    request.searchTerms,
    searchEvidenceMessageLimit,
  );
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  const contextLines = [
    `Retrieved transcript context for ${subject.title}:`,
    `Operation: fts_search(limit=${request.limit})`,
    `Query: ${request.query}`,
    `Search terms: ${request.searchTerms.join(', ') || '(none)'}`,
    `Matching hits: ${hits.length}`,
    `Evidence windows: ${windows.length}`,
  ];
  if (hits.length === 0 || windows.length === 0) {
    return {
      subject,
      request,
      stage: 'fts_search',
      query: request.query,
      confidence: 0,
      scoreSummary: 'no matches',
      context: [
        ...contextLines,
        'No strong transcript evidence matched this query in the resolved chat.',
      ].join('\n'),
      matchCount: 0,
      matchedMessageIds: [],
      windowMessageIds: [],
      evidenceMessageIds: [],
      evidenceGroups,
    };
  }
  return {
    subject,
    request,
    stage: 'fts_search',
    query: request.query,
    confidence: scoreToConfidence(windows[0]!.score),
    scoreSummary: `hits=${hits.length}, topWindow=${windows[0]!.score.toFixed(2)}`,
    context: [
      ...contextLines,
      '',
      renderEvidenceGroupsContext(evidenceGroups),
    ].join('\n'),
    matchCount: hits.length,
    matchedMessageIds: hits.map((hit) => hit.message.id),
    windowMessageIds: windows.map((window) => window.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  };
};

const renderProfileFactSearchResults = (
  subject: AssistantActiveBuffer,
  request: Extract<AssistantAskRetrievalRequest, { operation: 'profile_fact_search' }>,
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
  messages?: ChatMessage[],
): AssistantAskRetrievalMemory => {
  const allMessages = sortMessagesByTimestamp(resolveAllMessages(subject, conversations, messages));
  const windows = resolveProfileFactWindows(allMessages, request).slice(0, Math.max(1, request.limit));
  const matchedMessageIds = uniqueStrings(windows.flatMap((window) => window.matchedMessageIds));
  const evidenceMessages = collectExactMatchedEvidenceMessages(windows, matchedMessageIds, searchEvidenceMessageLimit);
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  const topStrategy = windows[0]?.strategy ?? 'qa_pair';
  const contextLines = [
    `Retrieved transcript context for ${subject.title}:`,
    `Operation: profile_fact_search(intent=${request.intent}, limit=${request.limit})`,
    `Query: ${request.query || '(none)'}`,
    `Search terms: ${request.searchTerms.join(', ') || '(none)'}`,
    `Strategy: ${topStrategy === 'qa_pair' ? 'question-answer windows' : 'lexical fallback windows'}`,
    `Matching windows: ${windows.length}`,
  ];
  if (windows.length === 0) {
    return {
      subject,
      request,
      stage: 'profile_fact_search',
      query: request.query,
      confidence: 0,
      scoreSummary: 'no matches',
      context: [
        ...contextLines,
        'No strong profile-fact transcript evidence matched this query in the resolved chat.',
      ].join('\n'),
      matchCount: 0,
      matchedMessageIds: [],
      windowMessageIds: [],
      evidenceMessageIds: [],
      evidenceGroups,
    };
  }
  return {
    subject,
    request,
    stage: 'profile_fact_search',
    query: request.query,
    confidence: scoreToConfidence(windows[0]!.score),
    scoreSummary: `windows=${windows.length}, topWindow=${windows[0]!.score.toFixed(2)}, strategy=${topStrategy}`,
    context: [
      ...contextLines,
      '',
      renderEvidenceGroupsContext(evidenceGroups),
    ].join('\n'),
    matchCount: windows.length,
    matchedMessageIds,
    windowMessageIds: windows.map((window) => window.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  };
};

const collectExactMatchedEvidenceMessages = (
  windows: Array<{ messages: ChatMessage[] }>,
  matchedMessageIds: string[],
  limit: number,
) => {
  const matchedIds = new Set(matchedMessageIds);
  const selected: ChatMessage[] = [];
  const seen = new Set<string>();
  for (const window of windows) {
    for (const message of window.messages) {
      if (!matchedIds.has(message.id) || seen.has(message.id)) {
        continue;
      }
      seen.add(message.id);
      selected.push(message);
      if (selected.length >= limit) {
        return selected;
      }
    }
  }
  return selected;
};

const renderMessageWindow = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  request: Extract<AssistantAskRetrievalRequest, { operation: 'message_window' }>,
): AssistantAskRetrievalMemory => {
  const evidenceMessages = messages;
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  return {
    subject,
    request,
    stage: 'message_window',
    query: request.messageId,
    confidence: messages.length > 0 ? 0.8 : 0,
    scoreSummary: `messages=${messages.length}`,
    context: messages.length === 0
      ? [
          `Retrieved transcript context for ${subject.title}:`,
          `Operation: message_window(messageId=${request.messageId}, before=${request.before}, after=${request.after})`,
          'The requested message window could not be loaded.',
        ].join('\n')
      : [
          `Retrieved transcript context for ${subject.title}:`,
          `Operation: message_window(messageId=${request.messageId}, before=${request.before}, after=${request.after})`,
          '',
          renderEvidenceGroupsContext(evidenceGroups),
        ].join('\n'),
    matchCount: messages.length,
    matchedMessageIds: messages.map((message) => message.id),
    windowMessageIds: [messages.map((message) => message.id)],
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  };
};

const renderSpanScanResults = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  searchTerms: string[],
  limit: number,
): AssistantAskRetrievalMemory => {
  const spans = rankSpans(messages, searchTerms).slice(0, limit);
  const matchedMessageIds = uniqueStrings(spans.flatMap((span) => span.messages
    .filter((message) => searchTerms.some((term) => matchesTerm(message, term)))
    .map((message) => message.id)));
  const evidenceMessages = collectRelevantEvidenceMessages(
    spans,
    matchedMessageIds,
    searchTerms,
    searchEvidenceMessageLimit,
  );
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  if (spans.length === 0) {
    return {
      subject,
      request: {
        operation: 'span_scan',
        limit,
        searchTerms,
      },
      stage: 'span_scan',
      query: searchTerms.join(', '),
      confidence: 0,
      scoreSummary: 'no matching spans',
      context: [
        `Retrieved transcript context for ${subject.title}:`,
        `Operation: span_scan(limit=${limit})`,
        `Search terms: ${searchTerms.join(', ') || '(none)'}`,
        'No high-scoring transcript spans were found during the deeper scan.',
      ].join('\n'),
      matchCount: 0,
      matchedMessageIds: [],
      windowMessageIds: [],
      evidenceMessageIds: [],
      evidenceGroups,
    };
  }
  return {
    subject,
    request: {
      operation: 'span_scan',
      limit,
      searchTerms,
    },
    stage: 'span_scan',
    query: searchTerms.join(', '),
    confidence: scoreToConfidence(spans[0]!.score),
    scoreSummary: `spans=${spans.length}, topSpan=${spans[0]!.score.toFixed(2)}`,
    context: [
      `Retrieved transcript context for ${subject.title}:`,
      `Operation: span_scan(limit=${limit})`,
      `Search terms: ${searchTerms.join(', ') || '(none)'}`,
      `Candidate spans: ${spans.length}`,
      '',
      renderEvidenceGroupsContext(evidenceGroups),
    ].join('\n'),
    matchCount: spans.length,
    matchedMessageIds,
    windowMessageIds: spans.map((span) => span.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  };
};

const renderLexicalSearchResults = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  searchTerms: string[],
  limit: number,
): AssistantAskRetrievalMemory => {
  const hits = rankMatchingMessages(messages, searchTerms).slice(0, limit);
  const windows = buildLegacyWindows(messages, hits.map((entry) => entry.index));
  const evidenceMessages = collectRelevantEvidenceMessages(
    windows,
    hits.map((hit) => hit.message.id),
    searchTerms,
    searchEvidenceMessageLimit,
  );
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  return {
    subject,
    request: {
      operation: 'search_buffer',
      limit,
      searchTerms,
    },
    stage: 'lexical_search',
    query: searchTerms.join(', '),
    confidence: hits.length > 0 ? 0.55 : 0,
    scoreSummary: `hits=${hits.length}`,
    context: hits.length === 0
      ? [
          `Retrieved transcript context for ${subject.title}:`,
          `Operation: search_buffer(limit=${limit})`,
          `Search terms: ${searchTerms.join(', ')}`,
          'No stored messages matched the requested terms in this buffer.',
        ].join('\n')
      : [
          `Retrieved transcript context for ${subject.title}:`,
          `Operation: search_buffer(limit=${limit})`,
          `Search terms: ${searchTerms.join(', ')}`,
          `Matching hits: ${hits.length}`,
          '',
          renderEvidenceGroupsContext(evidenceGroups),
        ].join('\n'),
    matchCount: hits.length,
    matchedMessageIds: hits.map((hit) => hit.message.id),
    windowMessageIds: windows.map((window) => window.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  };
};

const searchTranscript = (
  subject: AssistantActiveBuffer,
  query: string,
  searchTerms: string[],
  limit: number,
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
  messages?: ChatMessage[],
): SearchHit[] => {
  if (conversations) {
    return conversations
      .searchMessages(subject.networkId, subject.target, query, limit)
      .map((entry) => ({
        message: entry.message,
        score: normalizeFtsScore(entry.score, searchTerms),
      }));
  }
  return rankMatchingMessages(resolveAllMessages(subject, conversations, messages), searchTerms)
    .slice(0, limit)
    .map((entry) => ({
      message: entry.message,
      score: entry.score,
    }));
};

const resolveProfileFactWindows = (
  messages: ChatMessage[],
  request: Extract<AssistantAskRetrievalRequest, { operation: 'profile_fact_search' }>,
) => {
  if (request.intent === 'origin_location') {
    const qaWindows = findOriginLocationQaWindows(messages, request.searchTerms);
    if (qaWindows.length > 0) {
      return qaWindows;
    }
  }
  return buildProfileLexicalFallbackWindows(messages, request.searchTerms, request.limit);
};

const findOriginLocationQaWindows = (messages: ChatMessage[], searchTerms: string[]) => {
  const windows: ProfileFactCandidateWindow[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const question = messages[index]!;
    if (!isOriginLocationQuestionMessage(question)) {
      continue;
    }
    const questionEnd = extendSameSpeakerQuestionRun(messages, index);
    const answerStart = questionEnd + 1;
    const maxAnswerIndex = Math.min(messages.length - 1, questionEnd + profileFactAnswerWindow);
    if (answerStart > maxAnswerIndex) {
      continue;
    }
    const answerIndex = findAnswerIndex(messages, answerStart, maxAnswerIndex, question);
    if (answerIndex === -1) {
      continue;
    }
    const answerEnd = extendSameSpeakerAnswerRun(messages, answerIndex, maxAnswerIndex);
    const windowMessages = messages.slice(index, answerEnd + 1);
    const key = windowMessages.map((message) => message.id).join('|');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    windows.push({
      messageIds: windowMessages.map((message) => message.id),
      matchedMessageIds: windowMessages.map((message) => message.id),
      messages: windowMessages,
      score: scoreOriginLocationWindow(
        windowMessages,
        questionEnd - index + 1,
        answerEnd - answerIndex + 1,
        searchTerms,
      ),
      strategy: 'qa_pair',
    });
  }
  return windows.sort((left, right) => (
    right.score - left.score
    || left.messages[0]!.ts - right.messages[0]!.ts
    || left.messageIds[0]!.localeCompare(right.messageIds[0]!)
  ));
};

const buildProfileLexicalFallbackWindows = (
  messages: ChatMessage[],
  searchTerms: string[],
  limit: number,
) => {
  const hits = rankMatchingMessages(messages, searchTerms).slice(0, Math.max(1, limit));
  return buildLegacyWindows(messages, hits.map((entry) => entry.index))
    .map((window) => ({
      messageIds: window.messageIds,
      matchedMessageIds: window.messages
        .filter((message) => searchTerms.some((term) => matchesTerm(message, term)))
        .map((message) => message.id),
      messages: window.messages,
      score: scoreWindow(
        window.messages,
        searchTerms,
        hits.find((hit) => hit.index >= window.start && hit.index <= window.end)?.message.id ?? '',
      ),
      strategy: 'lexical_fallback' as const,
    }))
    .filter((window) => window.matchedMessageIds.length > 0)
    .sort((left, right) => (
      right.score - left.score
      || left.messages[0]!.ts - right.messages[0]!.ts
      || left.messageIds[0]!.localeCompare(right.messageIds[0]!)
    ));
};

const buildEvidenceWindows = (
  subject: AssistantActiveBuffer,
  hits: SearchHit[],
  searchTerms: string[],
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
  messages?: ChatMessage[],
): RetrievalWindow[] => {
  const windows = new Map<string, RetrievalWindow>();
  for (const hit of hits) {
    const windowMessages = resolveMessageWindow(
      subject,
      hit.message.id,
      messageWindowRadius,
      messageWindowRadius,
      conversations,
      messages,
    );
    if (windowMessages.length === 0) {
      continue;
    }
    const key = windowMessages.map((message) => message.id).join('|');
    if (windows.has(key)) {
      continue;
    }
    windows.set(key, {
      messageIds: windowMessages.map((message) => message.id),
      messages: windowMessages,
      score: scoreWindow(windowMessages, searchTerms, hit.message.id),
    });
  }
  return [...windows.values()];
};

const rankEvidenceWindows = (windows: RetrievalWindow[], searchTerms: string[]) =>
  [...windows].sort((left, right) => (
    right.score - left.score
    || scoreWindow(right.messages, searchTerms, right.messageIds[0] ?? '') - scoreWindow(left.messages, searchTerms, left.messageIds[0] ?? '')
  ));

const rankSpans = (messages: ChatMessage[], searchTerms: string[]) => {
  const spans: RetrievalWindow[] = [];
  if (messages.length === 0) {
    return spans;
  }
  for (let start = 0; start < messages.length; start += spanScanStride) {
    const spanMessages = messages.slice(start, Math.min(messages.length, start + spanScanWindowSize));
    if (spanMessages.length === 0) {
      continue;
    }
    const score = scoreWindow(spanMessages, searchTerms, '');
    if (score <= 0) {
      continue;
    }
    const candidate: RetrievalWindow = {
      messageIds: spanMessages.map((message) => message.id),
      messages: spanMessages,
      score,
    };
    const previous = spans.at(-1);
    if (previous && overlaps(previous.messageIds, candidate.messageIds)) {
      if (candidate.score > previous.score) {
        spans[spans.length - 1] = candidate;
      }
      continue;
    }
    spans.push(candidate);
  }
  return spans.sort((left, right) => right.score - left.score);
};

const scoreWindow = (messages: ChatMessage[], searchTerms: string[], focusMessageId: string) => {
  if (messages.length === 0) {
    return 0;
  }
  const focusBonus = focusMessageId ? 3 : 0;
  const score = searchTerms.reduce((total, term) => {
    const termMatches = messages.filter((message) => matchesTerm(message, term)).length;
    if (termMatches === 0) {
      return total;
    }
    return total + termWeight(term) * (1 + Math.min(termMatches, 3) * 0.35);
  }, 0);
  const exactBonus = messages.some((message) => message.id === focusMessageId) ? focusBonus : 0;
  return score + exactBonus;
};

const resolveOpeningMessages = (
  subject: AssistantActiveBuffer,
  limit: number,
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
  messages?: ChatMessage[],
) => conversations
  ? conversations.listOpeningMessages(subject.networkId, subject.target, limit)
  : resolveAllMessages(subject, conversations, messages).slice(0, Math.max(1, limit));

const resolveRecentMessages = (
  subject: AssistantActiveBuffer,
  limit: number,
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
  messages?: ChatMessage[],
) => conversations
  ? conversations.listRecentMessagesForBuffer(subject.networkId, subject.target, limit)
  : resolveAllMessages(subject, conversations, messages).slice(-Math.max(1, limit));

const resolveMessageWindow = (
  subject: AssistantActiveBuffer,
  messageId: string,
  before: number,
  after: number,
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
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

const resolveAllMessages = (
  subject: AssistantActiveBuffer,
  conversations?: Pick<
    RuntimeConversationStore,
    'getMessageWindow' | 'listAllMessages' | 'listOpeningMessages' | 'listRecentMessagesForBuffer' | 'searchMessages'
  >,
  messages?: ChatMessage[],
) => messages ?? conversations?.listAllMessages(subject.networkId, subject.target) ?? [];

const collectRelevantEvidenceMessages = (
  windows: Array<{ messages: ChatMessage[] }>,
  matchedMessageIds: string[],
  searchTerms: string[],
  limit: number,
) => {
  const selected: ChatMessage[] = [];
  const seenMessageIds = new Set<string>();
  const matchedIds = new Set(matchedMessageIds);
  for (const window of windows) {
    for (const message of selectRelevantEvidenceMessages(window.messages, matchedIds, searchTerms)) {
      if (seenMessageIds.has(message.id)) {
        continue;
      }
      seenMessageIds.add(message.id);
      selected.push(message);
      if (selected.length >= limit) {
        return selected;
      }
    }
  }
  return selected;
};

const selectRelevantEvidenceMessages = (
  messages: ChatMessage[],
  matchedMessageIds: Set<string>,
  searchTerms: string[],
) => {
  const relevantIndexes = new Set<number>();
  const matchingIndexes = messages
    .map((message, index) => (
      matchedMessageIds.has(message.id) || searchTerms.some((term) => matchesTerm(message, term))
        ? index
        : -1
    ))
    .filter((index) => index >= 0);

  for (const index of matchingIndexes) {
    relevantIndexes.add(index);
    if (index > 0 && canIncludeEvidenceNeighbor(messages[index]!, messages[index - 1]!)) {
      relevantIndexes.add(index - 1);
    }
    if (index < messages.length - 1 && canIncludeEvidenceNeighbor(messages[index]!, messages[index + 1]!)) {
      relevantIndexes.add(index + 1);
    }
  }

  if (relevantIndexes.size === 0) {
    return messages.slice(0, Math.min(messages.length, 3));
  }

  return [...relevantIndexes]
    .sort((left, right) => left - right)
    .map((index) => messages[index]!)
    .filter(Boolean);
};

const buildEvidenceGroups = (messages: ChatMessage[]): AssistantAskEvidenceGroup[] =>
  collapseEvidenceGroups(sortMessagesByTimestamp(messages).reduce<AssistantAskEvidenceGroup[]>((groups, message) => {
    groups.push({
      heading: formatEvidenceHeading(message.ts),
      lines: [formatEvidenceLine(message)],
    });
    return groups;
  }, []));

const collapseEvidenceGroups = (groups: AssistantAskEvidenceGroup[]) => {
  const merged: AssistantAskEvidenceGroup[] = [];
  const groupsByHeading = new Map<string, AssistantAskEvidenceGroup>();
  for (const group of groups) {
    const heading = group.heading.trim();
    const lines = group.lines.filter((line) => line.body.trim());
    if (!heading || lines.length === 0) {
      continue;
    }
    const existing = groupsByHeading.get(heading);
    if (existing) {
      for (const line of lines) {
        if (!existing.lines.some((candidate) => candidate.messageId === line.messageId)) {
          existing.lines.push(line);
        }
      }
      continue;
    }
    const nextGroup = { heading, lines: [...lines] };
    groupsByHeading.set(heading, nextGroup);
    merged.push(nextGroup);
  }
  return merged;
};

const sortMessagesByTimestamp = (messages: ChatMessage[]) =>
  [...messages].sort((left, right) => left.ts - right.ts || left.id.localeCompare(right.id));

const canIncludeEvidenceNeighbor = (anchor: ChatMessage, candidate: ChatMessage) =>
  formatEvidenceHeading(anchor.ts) === formatEvidenceHeading(candidate.ts)
  && Math.abs(anchor.ts - candidate.ts) <= evidenceNeighborMaxGapMs;

const renderTranscriptExcerpt = (messages: ChatMessage[], label: string) => {
  if (messages.length === 0) {
    return `${label}:\n(none)`;
  }
  return [
    `${label} | ${formatExcerptRange(messages)}`,
    ...messages.map(formatExcerptLine),
  ].join('\n');
};

const renderEvidenceGroupsContext = (groups: AssistantAskEvidenceGroup[]) => {
  if (groups.length === 0) {
    return 'Excerpt:\n(none)';
  }
  return [
    'Excerpt:',
    ...groups.flatMap((group) => [
      group.heading,
      ...group.lines.map((line) => formatEvidenceContextLine(line)),
    ]),
  ].join('\n');
};

const formatExcerptRange = (messages: ChatMessage[]) => {
  const first = messages[0]!;
  const last = messages.at(-1)!;
  const [firstDay, firstTime] = splitTimestamp(first.ts);
  const [lastDay, lastTime] = splitTimestamp(last.ts);
  if (firstDay === lastDay) {
    return firstTime === lastTime
      ? `${firstDay} | ${firstTime}`
      : `${firstDay} | ${firstTime}-${lastTime}`;
  }
  return `${firstDay} ${firstTime} to ${lastDay} ${lastTime}`;
};

const splitTimestamp = (ts: number) => {
  const stamp = formatTimestamp(ts);
  return [stamp.slice(0, 10), stamp.slice(11)] as const;
};

const formatEvidenceHeading = (ts: number) => splitTimestamp(ts)[0];

const formatEvidenceLine = (message: ChatMessage): AssistantAskEvidenceLine => ({
  messageId: message.id,
  speakerRole: message.speakerRole,
  speakerNick: message.speakerNick ?? message.nick,
  attributionConfidence: message.attributionConfidence,
  body: message.body,
  kind: message.kind,
});

const formatExcerptLine = (message: ChatMessage) => {
  if (message.kind === 'join' || message.kind === 'part' || message.kind === 'quit' || message.kind === 'system') {
    return `[${message.kind}] ${message.body}`;
  }
  const speaker = formatContextSpeaker(getTranscriptSpeakerLabel(message));
  if (message.kind === 'action') {
    return `* ${speaker} ${message.body}`;
  }
  return `${speaker}: ${message.body}`;
};

const formatEvidenceContextLine = (line: AssistantAskEvidenceLine) => {
  if (line.kind === 'join' || line.kind === 'part' || line.kind === 'quit' || line.kind === 'system') {
    return `[${line.kind}] ${line.body}`;
  }
  const speaker = line.speakerRole === 'self' && line.attributionConfidence === 'high'
    ? 'You'
    : line.speakerNick ?? 'unknown';
  if (line.kind === 'action') {
    return `* ${speaker} ${line.body}`;
  }
  return `${speaker}: ${line.body}`;
};

const formatContextSpeaker = (speaker: string) => speaker === 'you' ? 'You' : speaker;

const rankMatchingMessages = (messages: ChatMessage[], searchTerms: string[]) =>
  messages
    .map((message, index) => ({
      index,
      message,
      score: searchTerms.reduce((total, term) => total + (matchesTerm(message, term) ? termWeight(term) : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

const buildLegacyWindows = (messages: ChatMessage[], hitIndexes: number[]) => {
  const windows: Array<{ messageIds: string[]; messages: ChatMessage[]; start: number; end: number }> = [];
  for (const hitIndex of hitIndexes) {
    const start = Math.max(0, hitIndex - messageWindowRadius);
    const end = Math.min(messages.length - 1, hitIndex + messageWindowRadius);
    const previous = windows.at(-1);
    if (previous && start <= previous.end + 1) {
      previous.end = Math.max(previous.end, end);
      previous.messages = messages.slice(previous.start, previous.end + 1);
      previous.messageIds = previous.messages.map((message) => message.id);
      continue;
    }
    const windowMessages = messages.slice(start, end + 1);
    windows.push({
      start,
      end,
      messages: windowMessages,
      messageIds: windowMessages.map((message) => message.id),
    });
  }
  return windows;
};

const getMessageSpeakerKey = (message: ChatMessage) => {
  if (message.speakerRole === 'self' || message.self) {
    return 'self';
  }
  const nick = (message.speakerNick ?? message.nick ?? '').trim().toLowerCase();
  if (nick) {
    return `nick:${nick}`;
  }
  return `role:${message.speakerRole ?? 'unknown'}`;
};

const isLineLikeMessage = (message: ChatMessage) =>
  message.kind === 'line' || message.kind === 'action';

const isOriginLocationQuestionMessage = (message: ChatMessage) => {
  if (!isLineLikeMessage(message)) {
    return false;
  }
  const body = message.body.toLowerCase();
  return /\bwhere\s+(?:are|r)\s+you\s+from\b/.test(body)
    || /\bwhere\s+(?:is|was)\s+(?:she|he|they|[a-z0-9_.-]+)\s+from\b/.test(body)
    || /\bwhere\s+do(?:es)?\s+(?:you|she|he|they|[a-z0-9_.-]+)\s+live\b/.test(body)
    || /\bwhat\s+(?:city|state|country|part of (?:the )?(?:usa|us|europe))\b/.test(body)
    || (/\b(?:west coast|east coast|california|usa|europe)\b/.test(body) && body.includes('?'));
};

const extendSameSpeakerQuestionRun = (messages: ChatMessage[], startIndex: number) => {
  const speakerKey = getMessageSpeakerKey(messages[startIndex]!);
  let endIndex = startIndex;
  const maxIndex = Math.min(messages.length - 1, startIndex + profileFactAnswerWindow - 1);
  for (let index = startIndex + 1; index <= maxIndex; index += 1) {
    const message = messages[index]!;
    if (!isLineLikeMessage(message) || getMessageSpeakerKey(message) !== speakerKey) {
      break;
    }
    endIndex = index;
    if (!message.body.includes('?') && !isOriginLocationQuestionMessage(message)) {
      break;
    }
  }
  return endIndex;
};

const findAnswerIndex = (
  messages: ChatMessage[],
  startIndex: number,
  maxIndex: number,
  questionMessage: ChatMessage,
) => {
  const questionSpeakerKey = getMessageSpeakerKey(questionMessage);
  for (let index = startIndex; index <= maxIndex; index += 1) {
    const message = messages[index]!;
    if (!isLineLikeMessage(message)) {
      continue;
    }
    if (getMessageSpeakerKey(message) === questionSpeakerKey) {
      continue;
    }
    return index;
  }
  return -1;
};

const extendSameSpeakerAnswerRun = (messages: ChatMessage[], startIndex: number, maxIndex: number) => {
  const speakerKey = getMessageSpeakerKey(messages[startIndex]!);
  let endIndex = startIndex;
  for (let index = startIndex + 1; index <= maxIndex; index += 1) {
    const message = messages[index]!;
    if (!isLineLikeMessage(message) || getMessageSpeakerKey(message) !== speakerKey) {
      break;
    }
    if (message.body.includes('?')) {
      break;
    }
    endIndex = index;
  }
  return endIndex;
};

const scoreOriginLocationWindow = (
  messages: ChatMessage[],
  questionCount: number,
  answerCount: number,
  searchTerms: string[],
) => {
  const questionMessages = messages.slice(0, questionCount);
  const answerMessages = messages.slice(questionCount, questionCount + answerCount);
  const directQuestionBonus = questionMessages.reduce((total, message) => total + scoreOriginLocationPromptLine(message), 0);
  const answerBonus = answerMessages.reduce((total, message) => total + scoreOriginLocationAnswerLine(message), 0);
  const lexicalScore = scoreWindow(messages, searchTerms, answerMessages[0]?.id ?? questionMessages[0]?.id ?? '');
  const answerDistancePenalty = Math.max(0, questionCount + answerCount - 2) * 0.4;
  return 10 + directQuestionBonus + answerBonus + lexicalScore - answerDistancePenalty;
};

const scoreOriginLocationPromptLine = (message: ChatMessage) => {
  const body = message.body.toLowerCase();
  if (/\bwhere\s+(?:are|r)\s+you\s+from\b/.test(body)) {
    return 8;
  }
  if (/\bwhere\s+(?:is|was)\s+(?:she|he|they|[a-z0-9_.-]+)\s+from\b/.test(body)) {
    return 7;
  }
  if (/\bwhere\s+do(?:es)?\s+(?:you|she|he|they|[a-z0-9_.-]+)\s+live\b/.test(body)) {
    return 7;
  }
  if (/\bwhat\s+(?:city|state|country)\b/.test(body)) {
    return 6;
  }
  if (/\b(?:west coast|east coast)\b/.test(body) && body.includes('?')) {
    return 5;
  }
  return 3;
};

const scoreOriginLocationAnswerLine = (message: ChatMessage) => {
  const body = message.body.toLowerCase();
  let score = 2;
  if (!body.includes('?')) {
    score += 1;
  }
  if (/\b(?:yes|yeah|yep|nope|nah)\b/.test(body)) {
    score += 1;
  }
  if (/\b(?:from|live|in)\b/.test(body)) {
    score += 2;
  }
  if (body.length <= 32) {
    score += 1;
  }
  return score;
};

const normalizeFtsScore = (score: number, searchTerms: string[]) => {
  const magnitude = Math.abs(score);
  return magnitude > 0 ? (searchTerms.length + 1) / magnitude : searchTerms.length + 1;
};

const scoreToConfidence = (score: number) => Math.max(0, Math.min(1, score / 20));

const uniqueStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

const overlaps = (leftIds: string[], rightIds: string[]) => {
  const right = new Set(rightIds);
  return leftIds.some((id) => right.has(id));
};
