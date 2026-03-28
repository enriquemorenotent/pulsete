import type {
  AssistantActiveBuffer,
  AssistantAskRetrievalMemory,
  AssistantProfileFactIntent,
} from '../shared/protocol.js';
import { extractProfileFactTerms } from './assistant-history-context.js';
import { buildFactRetrievalRequests, buildProfileFactRetrievalRequests } from './assistant-ask-plan-requests.js';
import type { AskPromptAnalysis } from './assistant-ask-plan-types.js';
import { wordCount } from './assistant-ask-plan-utils.js';

export const analyzeAskPrompt = ({
  prompt,
  normalizedPrompt,
  previousRetrievals,
  transcriptSubject,
}: {
  prompt: string;
  normalizedPrompt: string;
  previousRetrievals: AssistantAskRetrievalMemory[];
  transcriptSubject: AssistantActiveBuffer | null;
}): AskPromptAnalysis => {
  if (isOpeningHistoryRequest(normalizedPrompt)) {
    return emptyAnalysis('opening', null);
  }
  if (isRecentHistoryRequest(normalizedPrompt)) {
    return emptyAnalysis('recent', null);
  }
  const factIntent = classifyAskFactIntent(prompt, normalizedPrompt);
  const hasPreviousRetrievals = previousRetrievals.length > 0;
  const hasQuotedSearchTerm = hasQuotedSearch(prompt);
  const hasFirstPersonReference = /\b(?:i|me|my|mine|we|us|our|ours)\b/.test(normalizedPrompt);
  const hasConversationReference = /\b(?:said|say|talked|talk|spoke|speaking|mentioned|mention|wrote|write|asked|told|fantasy|met|meet|meeting|chat|conversation|history|transcript|messages?|waiting|hotel|arrive|arrives|real|irl)\b/.test(normalizedPrompt);
  const hasTemporalOrEventReference = /\b(?:when|once|before|earlier|first|last|start|beginning|then|back then|after|during)\b/.test(normalizedPrompt);
  const hasRecallOrLookupReference = /\b(?:remember|remind|find|search|show|quote|quotes|confirm|identify|which one|what was|what is|tell me which|tell me what|look more carefully|look carefully)\b/.test(normalizedPrompt);
  const hasFollowUpCue = /\b(?:it|that|this|those|these|related to|the one|that one|more carefully|again|still|closer|look)\b/.test(normalizedPrompt);
  const explicitContinuation = hasPreviousRetrievals && isExplicitEvidenceContinuationPrompt(normalizedPrompt);
  const generalSubjectChat = isGeneralSubjectChat(normalizedPrompt)
    && !hasPreviousRetrievals
    && !hasFirstPersonReference
    && !hasConversationReference
    && !hasTemporalOrEventReference
    && !hasQuotedSearchTerm;
  if (factIntent) {
    return {
      ...emptyAnalysis('fact', factIntent),
      requests: buildProfileFactRetrievalRequests(prompt, transcriptSubject, factIntent),
    };
  }
  const wantsTranscriptFacts = !generalSubjectChat && (
    hasConversationReference
    || hasRecallOrLookupReference
    || hasQuotedSearchTerm
    || (hasFirstPersonReference && hasTemporalOrEventReference)
    || explicitContinuation
    || (!!transcriptSubject && (hasFirstPersonReference || hasFollowUpCue))
  );
  if (!wantsTranscriptFacts) {
    return {
      ...emptyAnalysis('none', null),
      generalSubjectChat,
      wantsTranscriptFacts: false,
    };
  }
  const requests = buildFactRetrievalRequests(prompt, transcriptSubject, previousRetrievals, explicitContinuation);
  if (requests.length > 0) {
    return {
      ...emptyAnalysis('fact', null),
      requests,
      reusePreviousRetrievals: explicitContinuation,
    };
  }
  return explicitContinuation
    ? {
        ...emptyAnalysis('none', null),
        reusePreviousRetrievals: true,
      }
    : {
        ...emptyAnalysis('none', null),
        wantsTranscriptFacts: true,
      };
};

const emptyAnalysis = (
  retrievalMode: AskPromptAnalysis['retrievalMode'],
  factIntent: AssistantProfileFactIntent | null,
): AskPromptAnalysis => ({
  generalSubjectChat: false,
  retrievalMode,
  factIntent,
  reusePreviousRetrievals: false,
  requests: [],
  wantsTranscriptFacts: true,
});

export const isChattyPrompt = (prompt: string) =>
  /^(?:hi|hello|hey|yo|sup|thanks|thank you|thx|ok|okay|cool|nice|lol|haha|good morning|good night|bye|cya|see you)\b/.test(prompt)
  && wordCount(prompt) <= 6;

export const isGeneralSubjectChat = (prompt: string) =>
  /^(?:what can you tell me about|tell me about|what do you think about|thoughts on|who is|describe|how would you describe|what about)\b/.test(prompt)
  || /\b(?:what kind of person|is .* like)\b/.test(prompt);

const isRecentHistoryRequest = (prompt: string) =>
  /\b(?:what happened|what's been going on|whats been going on|what went on|catch me up|recap|summari[sz]e|last night|recent(?:ly)?|latest|earlier today|today|yesterday)\b/.test(prompt);

const isOpeningHistoryRequest = (prompt: string) =>
  /\b(?:beginning|at the beginning|at first|first talked|first started talking|first messages?|opening messages?|how (?:we|i) started|how it started|how we started talking|how i started talking|started talking|start of (?:our|the) conversation|start of (?:our|the) chat)\b/.test(prompt);

const classifyAskFactIntent = (prompt: string, normalizedPrompt: string): AssistantProfileFactIntent | null => {
  if (/\bwhere\s+(?:is|was)\b.*\bfrom\b/.test(normalizedPrompt) || /\bwhere\s+(?:are|r)\s+you\s+from\b/.test(normalizedPrompt) || /\bwhere\s+do(?:es)?\b.*\blive\b/.test(normalizedPrompt) || /\bwhat\s+(?:city|state|country)\b/.test(normalizedPrompt) || /\b(?:hometown|west coast|east coast)\b/.test(normalizedPrompt)) {
    return 'origin_location';
  }
  const profileTerms = extractProfileFactTerms(prompt, 'origin_location');
  return profileTerms.some((term) => ['where', 'from', 'live', 'city', 'state', 'country', 'coast', 'hometown'].includes(term))
    ? 'origin_location'
    : null;
};

const isExplicitEvidenceContinuationPrompt = (prompt: string) =>
  /\b(?:what was it|what was that|what was the one|show me more|quote it|quote that|look closer|look more carefully|more carefully|again|that one|the one|that part|that exchange|that fantasy)\b/.test(prompt)
  || /\bit (?:was|is) related to\b/.test(prompt)
  || /\bit involved\b/.test(prompt)
  || /\bi(?:'ll| will)? give you a hint\b/.test(prompt)
  || /\bhere(?:'s| is) a hint\b/.test(prompt);

const hasQuotedSearch = (prompt: string) => /"[^"\n]{2,80}"/.test(prompt);
