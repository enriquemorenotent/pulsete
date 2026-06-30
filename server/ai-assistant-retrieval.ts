import type { AiAssistantRequest } from '../shared/protocol-ai.js';

type AiAssistantRetrievalRequest = Pick<
  AiAssistantRequest,
  'assistantTurns' | 'mode' | 'prompt'
>;

export type AiAssistantRetrievalPlan = {
  fullLogWhenSearchMisses: boolean;
  includeFullLog: boolean;
  searchTerms: string[];
};

export const planAiAssistantRetrieval = (
  request: AiAssistantRetrievalRequest,
): AiAssistantRetrievalPlan => {
  const prompt = request.prompt.trim();
  if (request.mode === 'suggest-reply' || !prompt) {
    return emptyRetrievalPlan;
  }
  const followUp = isAssistantThreadFollowUp(prompt, request.assistantTurns);
  return {
    fullLogWhenSearchMisses: followUp || hasHistoryIntent(prompt),
    includeFullLog: followUp || needsFullLog(prompt) || hasDateReference(prompt),
    searchTerms: extractSearchTerms(prompt),
  };
};

const emptyRetrievalPlan: AiAssistantRetrievalPlan = {
  fullLogWhenSearchMisses: false,
  includeFullLog: false,
  searchTerms: [],
};

const needsFullLog = (prompt: string) =>
  /\b(all|always|any time|best|count|entire|ever|every|everything|first|frequency|full|how many|last time|least|most|never|total|whole|worst)\b/i
    .test(prompt);

const hasHistoryIntent = (prompt: string) =>
  /\b(before|discussed|earlier|history|log|mentioned|older|past|previous|previously|remember|said|talked|when did)\b/i
    .test(prompt);

const hasDateReference = (prompt: string) =>
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i
    .test(prompt)
  || /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/.test(prompt);

const isAssistantThreadFollowUp = (
  prompt: string,
  turns: AiAssistantRetrievalRequest['assistantTurns'],
) =>
  turns.length > 0
  && /\b(above|former|it|latter|one|previous|runner[- ]?up|same|that|them|this|those|which)\b/i
    .test(prompt);

const extractSearchTerms = (prompt: string) => {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const rawTerm of prompt.match(/[\p{L}\p{N}'_-]+/gu) ?? []) {
    const term = rawTerm.toLowerCase().replace(/^'+|'+$/g, '');
    if (term.length < 3 || searchStopWords.has(term) || seen.has(term)) {
      continue;
    }
    seen.add(term);
    terms.push(term);
    if (terms.length >= searchTermLimit) {
      break;
    }
  }
  return terms;
};

const searchTermLimit = 5;

const searchStopWords = new Set([
  'about', 'after', 'again', 'answer', 'before', 'catch', 'conversation',
  'could', 'describe', 'did', 'does', 'ever', 'find', 'from', 'had', 'has',
  'have', 'history', 'how', 'many', 'message', 'messages', 'need', 'one',
  'said', 'say', 'something', 'tell', 'that', 'the', 'their', 'them', 'then',
  'there', 'they', 'this', 'times', 'was', 'were', 'what', 'when', 'where',
  'which', 'with', 'would', 'you',
]);
