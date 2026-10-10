import type { AiAssistantRequest } from '../shared/protocol-ai.js';
import { readAssistantDateRange } from './ai-assistant-dates.js';

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
    fullLogWhenSearchMisses: hasHistoryIntent(prompt),
    includeFullLog: needsFullLog(prompt) || hasDateReference(prompt),
    searchTerms: extractSearchTerms(followUp
      ? `${prompt} ${request.assistantTurns.filter((turn) => turn.role === 'user').at(-1)?.text ?? ''}`
      : prompt),
  };
};

const emptyRetrievalPlan: AiAssistantRetrievalPlan = {
  fullLogWhenSearchMisses: false,
  includeFullLog: false,
  searchTerms: [],
};

const needsFullLog = (prompt: string) =>
  /\b(all|always|any time|count|entire|ever|every|everything|first|frequency|full|how many|last time|least|most|never|total|whole|alle|alles|gesamte|gesamt|jemals|wie oft|wie viele|häufigkeit|ersten|letzte mal)\b/i
    .test(prompt);

const hasHistoryIntent = (prompt: string) =>
  /\b(before|discuss|discussed|earlier|history|log|mentioned|older|past|previous|previously|remember|said|talked|when did|früher|vorher|verlauf|besprochen|erwähnt|gesagt|erinnerst)\b/i
    .test(prompt);

const hasDateReference = (prompt: string) => readAssistantDateRange(prompt) !== null;

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
  'can', 'please', 'explain', 'briefly', 'discuss', 'discussed', 'yesterday', 'today',
  'wie', 'oft', 'viele', 'haben', 'wir', 'uns', 'getroffen', 'was', 'wann', 'gestern',
  'heute', 'vorgestern', 'bitte', 'kannst', 'erklären', 'diese', 'dieser', 'dieses',
  'eine', 'einen', 'einem', 'einer', 'der', 'die', 'das', 'und', 'mit', 'für', 'ist',
  'sind', 'hat', 'über', 'den', 'dem', 'aus', 'besprochen', 'jemals', 'alle',
  'about', 'after', 'again', 'answer', 'before', 'catch', 'conversation',
  'could', 'describe', 'did', 'does', 'ever', 'find', 'from', 'had', 'has',
  'have', 'history', 'how', 'many', 'message', 'messages', 'need', 'one',
  'said', 'say', 'something', 'tell', 'that', 'the', 'their', 'them', 'then',
  'there', 'they', 'this', 'times', 'was', 'were', 'what', 'when', 'where',
  'which', 'with', 'would', 'you',
]);
