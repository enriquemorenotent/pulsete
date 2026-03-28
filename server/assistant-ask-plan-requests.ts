import type {
  AssistantActiveBuffer,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
  AssistantProfileFactIntent,
} from '../shared/protocol.js';
import {
  extractProfileFactTerms,
  extractSearchTerms,
  termWeight,
} from './assistant-history-context.js';
import {
  ftsHitLimit,
  maxFactQueries,
  openingMessageLimit,
  profileFactHitLimit,
  searchNoiseTerms,
  spanScanLimit,
} from './assistant-ask-plan-constants.js';
import {
  extractQuotedPhrases,
  sameAssistantBuffer,
  tokenize,
  uniqueStrings,
} from './assistant-ask-plan-utils.js';

export const buildFactRetrievalRequests = (
  prompt: string,
  subject: AssistantActiveBuffer | null,
  previousRetrievals: AssistantAskRetrievalMemory[],
  reusePreviousSearchTerms: boolean,
) => {
  if (!subject) {
    return [] satisfies AssistantAskRetrievalRequest[];
  }
  const queryAgenda = buildFactQueryAgenda(prompt, subject, reusePreviousSearchTerms ? previousRetrievals : []);
  const requests: AssistantAskRetrievalRequest[] = queryAgenda
    .slice(0, maxFactQueries)
    .map((entry) => ({
      operation: 'fts_search',
      limit: ftsHitLimit,
      query: entry.query,
      searchTerms: entry.searchTerms,
    }));
  requests.push({
    operation: 'span_scan',
    limit: spanScanLimit,
    searchTerms: uniqueStrings(queryAgenda.flatMap((entry) => entry.searchTerms)).slice(0, 8),
  });
  return requests;
};

export const buildProfileFactRetrievalRequests = (
  prompt: string,
  subject: AssistantActiveBuffer | null,
  intent: AssistantProfileFactIntent,
) => {
  if (!subject) {
    return [] satisfies AssistantAskRetrievalRequest[];
  }
  const searchTerms = collectProfileFactTerms(prompt, subject, intent);
  return [
    {
      operation: 'profile_fact_search',
      intent,
      limit: profileFactHitLimit,
      query: searchTerms.join(', '),
      searchTerms,
    },
    {
      operation: 'load_opening_buffer_messages',
      limit: openingMessageLimit,
    },
  ] satisfies AssistantAskRetrievalRequest[];
};

const buildFactQueryAgenda = (
  prompt: string,
  subject: AssistantActiveBuffer,
  previousRetrievals: AssistantAskRetrievalMemory[],
) => {
  const promptTerms = collectPromptTerms(prompt, subject);
  const previousTerms = collectPreviousSearchTerms(previousRetrievals, subject);
  const quotedPhrases = extractQuotedPhrases(prompt)
    .filter((phrase) => !searchNoiseTerms.has(phrase.toLowerCase()))
    .slice(0, 2);
  const agenda: Array<{ query: string; searchTerms: string[] }> = [];

  for (const phrase of quotedPhrases) {
    agenda.push({
      query: quoteFtsPhrase(phrase),
      searchTerms: phrase.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6),
    });
  }
  addAgendaEntry(agenda, prioritizeSearchTerms([...promptTerms, ...previousTerms]).slice(0, 4), 'and');
  addAgendaEntry(agenda, prioritizeSearchTerms([...promptTerms, ...previousTerms]).slice(0, 6), 'or');
  return dedupeAgenda(agenda);
};

const addAgendaEntry = (
  agenda: Array<{ query: string; searchTerms: string[] }>,
  terms: string[],
  mode: 'and' | 'or',
) => {
  if (terms.length === 0) {
    return;
  }
  agenda.push({
    query: buildFtsQuery(terms, mode),
    searchTerms: terms,
  });
};

const collectPromptTerms = (prompt: string, subject: AssistantActiveBuffer) => {
  const subjectTerms = new Set([
    subject.target.toLowerCase(),
    subject.title.toLowerCase(),
    ...tokenize(subject.target),
    ...tokenize(subject.title),
  ]);
  return uniqueStrings([
    ...extractQuotedPhrases(prompt).map((phrase) => phrase.toLowerCase()),
    ...extractSearchTerms(prompt),
  ])
    .flatMap((term) => term.includes(' ') ? term.split(/\s+/) : [term])
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 3 && !searchNoiseTerms.has(term) && !subjectTerms.has(term))
    .slice(0, 8);
};

const collectProfileFactTerms = (
  prompt: string,
  subject: AssistantActiveBuffer,
  intent: AssistantProfileFactIntent,
) => {
  const subjectTerms = new Set([
    subject.target.toLowerCase(),
    subject.title.toLowerCase(),
    ...tokenize(subject.target),
    ...tokenize(subject.title),
  ]);
  const extracted = uniqueStrings(extractProfileFactTerms(prompt, intent).map((term) => term.toLowerCase()))
    .filter((term) => !subjectTerms.has(term));
  if (extracted.length > 0) {
    return extracted.slice(0, 8);
  }
  return intent === 'origin_location'
    ? ['where', 'from', 'live', 'city', 'state', 'country']
    : [];
};

const collectPreviousSearchTerms = (
  previousRetrievals: AssistantAskRetrievalMemory[],
  subject: AssistantActiveBuffer,
) => {
  const subjectTerms = new Set([
    subject.target.toLowerCase(),
    subject.title.toLowerCase(),
    ...tokenize(subject.target),
    ...tokenize(subject.title),
  ]);
  const terms = previousRetrievals.flatMap((retrieval) => {
    if (!sameAssistantBuffer(retrieval.subject, subject) || !('searchTerms' in retrieval.request)) {
      return [];
    }
    return retrieval.request.searchTerms;
  });
  return uniqueStrings(terms.map((term) => term.toLowerCase()))
    .filter((term) => term.length >= 3 && !searchNoiseTerms.has(term) && !subjectTerms.has(term))
    .slice(0, 6);
};

const prioritizeSearchTerms = (terms: string[]) =>
  uniqueStrings(terms)
    .sort((left, right) => termWeight(right) - termWeight(left) || right.length - left.length || left.localeCompare(right));

const dedupeAgenda = (agenda: Array<{ query: string; searchTerms: string[] }>) => {
  const seen = new Set<string>();
  return agenda.filter((entry) => {
    if (!entry.query.trim()) {
      return false;
    }
    const key = `${entry.query}::${entry.searchTerms.join('|')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const buildFtsQuery = (terms: string[], mode: 'and' | 'or') =>
  terms
    .map((term) => ftsToken(term))
    .filter(Boolean)
    .join(mode === 'and' ? ' AND ' : ' OR ');

const ftsToken = (term: string) => {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return normalized.includes(' ')
    ? quoteFtsPhrase(normalized)
    : `"${normalized.replace(/"/g, '""')}"*`;
};

const quoteFtsPhrase = (phrase: string) => `"${phrase.trim().replace(/"/g, '""')}"`;
