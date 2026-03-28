import type {
  AssistantActiveBuffer,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
  ChatMessage,
} from '../shared/protocol.js';
import { matchesTerm } from './assistant-history-context.js';
import { searchEvidenceMessageLimit } from './assistant-ask-retrieval-constants.js';
import {
  buildEvidenceGroups,
  collectExactMatchedEvidenceMessages,
  collectRelevantEvidenceMessages,
  renderEvidenceGroupsContext,
} from './assistant-ask-evidence.js';
import { resolveProfileFactWindows } from './assistant-ask-profile-facts.js';
import { createRetrievalMemory } from './assistant-ask-retrieval-memory.js';
import {
  buildEvidenceWindows,
  buildSearchWindows,
  rankEvidenceWindows,
  rankMatchingMessages,
  rankSpans,
  scoreToConfidence,
  searchTranscript,
  uniqueStrings,
} from './assistant-ask-retrieval-search.js';
import type { AssistantAskRetrievalConversations } from './assistant-ask-retrieval-types.js';

export const buildFtsRetrievalMemory = (
  subject: AssistantActiveBuffer,
  request: Extract<AssistantAskRetrievalRequest, { operation: 'fts_search' }>,
  conversations?: AssistantAskRetrievalConversations,
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
    ...(hits.length === 0 || windows.length === 0
      ? ['No strong transcript evidence matched this query in the resolved chat.']
      : ['', renderEvidenceGroupsContext(evidenceGroups)]),
  ];
  return createRetrievalMemory({
    subject,
    request,
    stage: 'fts_search',
    query: request.query,
    confidence: windows.length === 0 ? 0 : scoreToConfidence(windows[0]!.score),
    scoreSummary: windows.length === 0 ? 'no matches' : `hits=${hits.length}, topWindow=${windows[0]!.score.toFixed(2)}`,
    contextLines,
    matchCount: hits.length,
    matchedMessageIds: hits.map((hit) => hit.message.id),
    windowMessageIds: windows.map((window) => window.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  });
};

export const buildProfileFactRetrievalMemory = (
  subject: AssistantActiveBuffer,
  request: Extract<AssistantAskRetrievalRequest, { operation: 'profile_fact_search' }>,
  messages: ChatMessage[],
): AssistantAskRetrievalMemory => {
  const windows = resolveProfileFactWindows([...messages].sort((left, right) => left.ts - right.ts || left.id.localeCompare(right.id)), request)
    .slice(0, Math.max(1, request.limit));
  const matchedMessageIds = uniqueStrings(windows.flatMap((window) => window.matchedMessageIds));
  const evidenceMessages = collectExactMatchedEvidenceMessages(windows, matchedMessageIds, searchEvidenceMessageLimit);
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  const topStrategy = windows[0]?.strategy ?? 'qa_pair';
  return createRetrievalMemory({
    subject,
    request,
    stage: 'profile_fact_search',
    query: request.query,
    confidence: windows.length === 0 ? 0 : scoreToConfidence(windows[0]!.score),
    scoreSummary: windows.length === 0 ? 'no matches' : `windows=${windows.length}, topWindow=${windows[0]!.score.toFixed(2)}, strategy=${topStrategy}`,
    contextLines: [
      `Retrieved transcript context for ${subject.title}:`,
      `Operation: profile_fact_search(intent=${request.intent}, limit=${request.limit})`,
      `Query: ${request.query || '(none)'}`,
      `Search terms: ${request.searchTerms.join(', ') || '(none)'}`,
      `Strategy: ${topStrategy === 'qa_pair' ? 'question-answer windows' : 'lexical fallback windows'}`,
      `Matching windows: ${windows.length}`,
      ...(windows.length === 0
        ? ['No strong profile-fact transcript evidence matched this query in the resolved chat.']
        : ['', renderEvidenceGroupsContext(evidenceGroups)]),
    ],
    matchCount: windows.length,
    matchedMessageIds,
    windowMessageIds: windows.map((window) => window.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  });
};

export const buildSpanScanRetrievalMemory = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  searchTerms: string[],
  limit: number,
): AssistantAskRetrievalMemory => {
  const spans = rankSpans(messages, searchTerms).slice(0, limit);
  const matchedMessageIds = uniqueStrings(spans.flatMap((span) => span.messages
    .filter((message) => searchTerms.some((term) => matchesTerm(message, term)))
    .map((message) => message.id)));
  const evidenceMessages = collectRelevantEvidenceMessages(spans, matchedMessageIds, searchTerms, searchEvidenceMessageLimit);
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  return createRetrievalMemory({
    subject,
    request: { operation: 'span_scan', limit, searchTerms },
    stage: 'span_scan',
    query: searchTerms.join(', '),
    confidence: spans.length === 0 ? 0 : scoreToConfidence(spans[0]!.score),
    scoreSummary: spans.length === 0 ? 'no matching spans' : `spans=${spans.length}, topSpan=${spans[0]!.score.toFixed(2)}`,
    contextLines: [
      `Retrieved transcript context for ${subject.title}:`,
      `Operation: span_scan(limit=${limit})`,
      `Search terms: ${searchTerms.join(', ') || '(none)'}`,
      ...(spans.length === 0
        ? ['No high-scoring transcript spans were found during the deeper scan.']
        : [`Candidate spans: ${spans.length}`, '', renderEvidenceGroupsContext(evidenceGroups)]),
    ],
    matchCount: spans.length,
    matchedMessageIds,
    windowMessageIds: spans.map((span) => span.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  });
};

export const buildLexicalSearchRetrievalMemory = (
  subject: AssistantActiveBuffer,
  messages: ChatMessage[],
  searchTerms: string[],
  limit: number,
): AssistantAskRetrievalMemory => {
  const hits = rankMatchingMessages(messages, searchTerms).slice(0, limit);
  const windows = buildSearchWindows(messages, hits.map((entry) => entry.index));
  const evidenceMessages = collectRelevantEvidenceMessages(windows, hits.map((hit) => hit.message.id), searchTerms, searchEvidenceMessageLimit);
  const evidenceGroups = buildEvidenceGroups(evidenceMessages);
  return createRetrievalMemory({
    subject,
    request: { operation: 'search_buffer', limit, searchTerms },
    stage: 'lexical_search',
    query: searchTerms.join(', '),
    confidence: hits.length > 0 ? 0.55 : 0,
    scoreSummary: `hits=${hits.length}`,
    contextLines: [
      `Retrieved transcript context for ${subject.title}:`,
      `Operation: search_buffer(limit=${limit})`,
      `Search terms: ${searchTerms.join(', ')}`,
      ...(hits.length === 0
        ? ['No stored messages matched the requested terms in this buffer.']
        : [`Matching hits: ${hits.length}`, '', renderEvidenceGroupsContext(evidenceGroups)]),
    ],
    matchCount: hits.length,
    matchedMessageIds: hits.map((hit) => hit.message.id),
    windowMessageIds: windows.map((window) => window.messageIds),
    evidenceMessageIds: evidenceMessages.map((message) => message.id),
    evidenceGroups,
  });
};
