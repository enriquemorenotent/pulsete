import type { AssistantProfileFactIntent, ChatMessage } from '../shared/protocol.js';
import { formatTimestamp } from './assistant-history-format.js';

const stopWords = new Set([
  'a', 'an', 'and', 'are', 'ask', 'about', 'been', 'buffer', 'but', 'can', 'chat', 'could', 'conversation', 'did',
  'does', 'for', 'from', 'have', 'history', 'how', 'into', 'last', 'maybe', 'message', 'more', 'much', 'not', 'now',
  'our', 'out', 'question', 'recent', 'should', 'something', 'talked', 'that', 'the', 'their', 'them', 'there',
  'these', 'they', 'this', 'those', 'use', 'using', 'want', 'what', 'when', 'where', 'which', 'whole', 'why',
  'with', 'would', 'you', 'your',
]);

const profileFactNoiseTerms = new Set([
  'a', 'about', 'am', 'an', 'assistant', 'buffer', 'chat', 'conversation', 'does', 'give', 'history', 'is', 'me',
  'messages', 'please', 'question', 'she', 'tell', 'the', 'transcript', 'what',
]);

const originLocationCueTerms = new Set([
  'where', 'from', 'live', 'lives', 'city', 'state', 'country', 'coast', 'hometown', 'location',
]);

const originLocationCuePhrases = [
  'west coast',
  'east coast',
  'where are you from',
  'where is she from',
  'where is he from',
  'where does she live',
  'where does he live',
  'what city',
  'what state',
  'what country',
] as const;

export const extractSearchTerms = (prompt: string) => {
  const terms = prompt.toLowerCase().match(/[a-z0-9#@._-]+/g) ?? [];
  const unique = new Set<string>();
  for (const term of terms) {
    if (unique.size >= 8) {
      break;
    }
    if (!isSearchTerm(term) || unique.has(term)) {
      continue;
    }
    unique.add(term);
  }
  return [...unique];
};

export const extractProfileFactTerms = (
  prompt: string,
  intent: AssistantProfileFactIntent,
) => {
  if (intent !== 'origin_location') {
    return [];
  }
  const normalizedPrompt = prompt.toLowerCase();
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const phrase of originLocationCuePhrases) {
    if (!normalizedPrompt.includes(phrase) || seen.has(phrase)) {
      continue;
    }
    seen.add(phrase);
    terms.push(phrase);
  }
  const tokens = normalizedPrompt.match(/[a-z0-9#@._-]+/g) ?? [];
  for (const token of tokens) {
    if (terms.length >= 8) {
      break;
    }
    if (seen.has(token) || profileFactNoiseTerms.has(token) || (!originLocationCueTerms.has(token) && token.length < 3)) {
      continue;
    }
    seen.add(token);
    terms.push(token);
  }
  return terms;
};

export const matchesTerm = (message: ChatMessage, term: string) => {
  const haystacks = [
    message.nick?.toLowerCase() ?? '',
    message.body.toLowerCase(),
    message.kind.toLowerCase(),
    buildTimestampSearchText(message.ts),
  ];
  return haystacks.some((haystack) => haystack.includes(term));
};

export const termWeight = (term: string) => {
  if (/[#@]/.test(term) || /\d/.test(term)) {
    return 6;
  }
  if (term.length >= 7) {
    return 5;
  }
  if (term.length >= 5) {
    return 4;
  }
  return 3;
};

const isSearchTerm = (term: string) =>
  !stopWords.has(term) && (term.length >= 3 || /[#@]/.test(term) || /\d/.test(term));

const buildTimestampSearchText = (ts: number) => {
  const date = new Date(ts);
  const year = String(date.getUTCFullYear());
  const monthNumber = String(date.getUTCMonth() + 1).padStart(2, '0');
  const monthShort = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();
  const monthLong = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  const day = String(date.getUTCDate()).padStart(2, '0');
  return [
    formatTimestamp(ts).toLowerCase(),
    `${year}-${monthNumber}-${day}`,
    year,
    monthShort,
    monthLong,
    `${monthShort} ${year}`,
    `${monthLong} ${year}`,
  ].join(' ');
};
