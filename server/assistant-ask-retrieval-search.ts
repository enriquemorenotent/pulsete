import type {
  AssistantActiveBuffer,
  ChatMessage,
} from '../shared/protocol.js';
import {
  matchesTerm,
  termWeight,
} from './assistant-history-context.js';
import {
  messageWindowRadius,
  spanScanStride,
  spanScanWindowSize,
} from './assistant-ask-retrieval-constants.js';
import { resolveAllMessages, resolveMessageWindow } from './assistant-ask-retrieval-source.js';
import type {
  AssistantAskRetrievalConversations,
  RetrievalRangeWindow,
  RetrievalWindow,
  SearchHit,
} from './assistant-ask-retrieval-types.js';

export const searchTranscript = (
  subject: AssistantActiveBuffer,
  query: string,
  searchTerms: string[],
  limit: number,
  conversations?: AssistantAskRetrievalConversations,
  messages?: ChatMessage[],
): SearchHit[] => {
  if (conversations) {
    return conversations.searchMessages(subject.networkId, subject.target, query, limit).map((entry) => ({
      message: entry.message,
      score: normalizeFtsScore(entry.score, searchTerms),
    }));
  }
  return rankMatchingMessages(resolveAllMessages(subject, conversations, messages), searchTerms)
    .slice(0, limit)
    .map((entry) => ({ message: entry.message, score: entry.score }));
};

export const buildEvidenceWindows = (
  subject: AssistantActiveBuffer,
  hits: SearchHit[],
  searchTerms: string[],
  conversations?: AssistantAskRetrievalConversations,
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
    if (!windows.has(key)) {
      windows.set(key, {
        messageIds: windowMessages.map((message) => message.id),
        messages: windowMessages,
        score: scoreWindow(windowMessages, searchTerms, hit.message.id),
      });
    }
  }
  return [...windows.values()];
};

export const rankEvidenceWindows = (windows: RetrievalWindow[], searchTerms: string[]) =>
  [...windows].sort((left, right) => (
    right.score - left.score
    || scoreWindow(right.messages, searchTerms, right.messageIds[0] ?? '')
      - scoreWindow(left.messages, searchTerms, left.messageIds[0] ?? '')
  ));

export const rankSpans = (messages: ChatMessage[], searchTerms: string[]) => {
  const spans: RetrievalWindow[] = [];
  for (let start = 0; start < messages.length; start += spanScanStride) {
    const spanMessages = messages.slice(start, Math.min(messages.length, start + spanScanWindowSize));
    const score = scoreWindow(spanMessages, searchTerms, '');
    if (spanMessages.length === 0 || score <= 0) {
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

export const scoreWindow = (messages: ChatMessage[], searchTerms: string[], focusMessageId: string) => {
  const focusBonus = focusMessageId ? 3 : 0;
  const score = searchTerms.reduce((total, term) => {
    const termMatches = messages.filter((message) => matchesTerm(message, term)).length;
    return termMatches === 0
      ? total
      : total + termWeight(term) * (1 + Math.min(termMatches, 3) * 0.35);
  }, 0);
  const exactBonus = messages.some((message) => message.id === focusMessageId) ? focusBonus : 0;
  return score + exactBonus;
};

export const rankMatchingMessages = (messages: ChatMessage[], searchTerms: string[]) =>
  messages
    .map((message, index) => ({
      index,
      message,
      score: searchTerms.reduce((total, term) => total + (matchesTerm(message, term) ? termWeight(term) : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

export const buildSearchWindows = (messages: ChatMessage[], hitIndexes: number[]) => {
  const windows: RetrievalRangeWindow[] = [];
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
    windows.push({ start, end, messages: windowMessages, messageIds: windowMessages.map((message) => message.id), score: 0 });
  }
  return windows;
};

export const normalizeFtsScore = (score: number, searchTerms: string[]) => {
  const magnitude = Math.abs(score);
  return magnitude > 0 ? (searchTerms.length + 1) / magnitude : searchTerms.length + 1;
};

export const scoreToConfidence = (score: number) => Math.max(0, Math.min(1, score / 20));

export const uniqueStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

const overlaps = (leftIds: string[], rightIds: string[]) => {
  const right = new Set(rightIds);
  return leftIds.some((id) => right.has(id));
};
