import type {
  AssistantAskRetrievalRequest,
  ChatMessage,
} from '../shared/protocol.js';
import { matchesTerm } from './assistant-history-context.js';
import { profileFactAnswerWindow } from './assistant-ask-retrieval-constants.js';
import {
  buildSearchWindows,
  rankMatchingMessages,
  scoreWindow,
} from './assistant-ask-retrieval-search.js';
import type { ProfileFactCandidateWindow } from './assistant-ask-retrieval-types.js';

export const resolveProfileFactWindows = (
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
    const maxAnswerIndex = Math.min(messages.length - 1, questionEnd + profileFactAnswerWindow);
    const answerIndex = findAnswerIndex(messages, questionEnd + 1, maxAnswerIndex, question);
    if (questionEnd + 1 > maxAnswerIndex || answerIndex === -1) {
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
  return sortCandidateWindows(windows);
};

const buildProfileLexicalFallbackWindows = (
  messages: ChatMessage[],
  searchTerms: string[],
  limit: number,
) => {
  const hits = rankMatchingMessages(messages, searchTerms).slice(0, Math.max(1, limit));
  const windows = buildSearchWindows(messages, hits.map((entry) => entry.index));
  return sortCandidateWindows(windows
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
    .filter((window) => window.matchedMessageIds.length > 0));
};

const sortCandidateWindows = (windows: ProfileFactCandidateWindow[]) => windows.sort((left, right) => (
  right.score - left.score
  || left.messages[0]!.ts - right.messages[0]!.ts
  || left.messageIds[0]!.localeCompare(right.messageIds[0]!)
));

const getMessageSpeakerKey = (message: ChatMessage) => {
  if (message.speakerRole === 'self' || message.self) {
    return 'self';
  }
  const nick = (message.speakerNick ?? message.nick ?? '').trim().toLowerCase();
  return nick ? `nick:${nick}` : `role:${message.speakerRole ?? 'unknown'}`;
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

const findAnswerIndex = (messages: ChatMessage[], startIndex: number, maxIndex: number, questionMessage: ChatMessage) => {
  const questionSpeakerKey = getMessageSpeakerKey(questionMessage);
  for (let index = startIndex; index <= maxIndex; index += 1) {
    const message = messages[index]!;
    if (isLineLikeMessage(message) && getMessageSpeakerKey(message) !== questionSpeakerKey) {
      return index;
    }
  }
  return -1;
};

const extendSameSpeakerAnswerRun = (messages: ChatMessage[], startIndex: number, maxIndex: number) => {
  const speakerKey = getMessageSpeakerKey(messages[startIndex]!);
  let endIndex = startIndex;
  for (let index = startIndex + 1; index <= maxIndex; index += 1) {
    const message = messages[index]!;
    if (!isLineLikeMessage(message) || getMessageSpeakerKey(message) !== speakerKey || message.body.includes('?')) {
      break;
    }
    endIndex = index;
  }
  return endIndex;
};

const scoreOriginLocationWindow = (messages: ChatMessage[], questionCount: number, answerCount: number, searchTerms: string[]) => {
  const questionMessages = messages.slice(0, questionCount);
  const answerMessages = messages.slice(questionCount, questionCount + answerCount);
  const directQuestionBonus = questionMessages.reduce((total, message) => total + scoreOriginLocationPromptLine(message), 0);
  const answerBonus = answerMessages.reduce((total, message) => total + scoreOriginLocationAnswerLine(message), 0);
  const focusId = answerMessages[0]?.id ?? questionMessages[0]?.id ?? '';
  return 10 + directQuestionBonus + answerBonus + scoreWindow(messages, searchTerms, focusId)
    - Math.max(0, questionCount + answerCount - 2) * 0.4;
};

const scoreOriginLocationPromptLine = (message: ChatMessage) => {
  const body = message.body.toLowerCase();
  if (/\bwhere\s+(?:are|r)\s+you\s+from\b/.test(body)) return 8;
  if (/\bwhere\s+(?:is|was)\s+(?:she|he|they|[a-z0-9_.-]+)\s+from\b/.test(body)) return 7;
  if (/\bwhere\s+do(?:es)?\s+(?:you|she|he|they|[a-z0-9_.-]+)\s+live\b/.test(body)) return 7;
  if (/\bwhat\s+(?:city|state|country)\b/.test(body)) return 6;
  if (/\b(?:west coast|east coast)\b/.test(body) && body.includes('?')) return 5;
  return 3;
};

const scoreOriginLocationAnswerLine = (message: ChatMessage) => {
  const body = message.body.toLowerCase();
  let score = 2;
  if (!body.includes('?')) score += 1;
  if (/\b(?:yes|yeah|yep|nope|nah)\b/.test(body)) score += 1;
  if (/\b(?:from|live|in)\b/.test(body)) score += 2;
  if (body.length <= 32) score += 1;
  return score;
};
