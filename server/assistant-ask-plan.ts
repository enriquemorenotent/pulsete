import type {
  AssistantActiveBuffer,
  AssistantAskClarification,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
  AssistantProfileFactIntent,
  AssistantTurnRouting,
} from '../shared/protocol.js';
import {
  extractProfileFactTerms,
  extractSearchTerms,
  termWeight,
} from './assistant-history-context.js';

const recentMessageLimit = 40;
const openingMessageLimit = 40;
const ftsHitLimit = 8;
const messageWindowRadius = 8;
const spanScanLimit = 3;
const spanScanWindowSize = 28;
const spanScanStride = 14;
const maxFactQueries = 2;
const profileFactHitLimit = 6;
const recentEvidenceMessageLimit = 8;
const openingEvidenceMessageLimit = 8;
const messageWindowEvidenceMessageLimit = 10;
const searchEvidenceMessageLimit = 10;
const evidenceNeighborMaxGapMs = 15 * 60_000;
const profileFactAnswerWindow = 3;

const searchNoiseTerms = new Set([
  'about',
  'ask',
  'asked',
  'assistant',
  'buffer',
  'chat',
  'clue',
  'conversation',
  'find',
  'first',
  'for',
  'give',
  'hint',
  'history',
  'identify',
  'in',
  'involved',
  'is',
  'it',
  'life',
  'log',
  'look',
  'meet',
  'meeting',
  'mention',
  'message',
  'messages',
  'more',
  'person',
  'quote',
  'real',
  'related',
  'remember',
  'remind',
  'said',
  'search',
  'show',
  'something',
  'talk',
  'talked',
  'tell',
  'that',
  'the',
  'their',
  'there',
  'thing',
  'this',
  'transcript',
  'was',
  'what',
  'when',
  'which',
]);

const subjectHintNoiseTerms = new Set([
  'a',
  'an',
  'and',
  'beginning',
  'chat',
  'conversation',
  'first',
  'it',
  'log',
  'messages',
  'my',
  'our',
  'start',
  'the',
  'their',
  'this',
  'transcript',
  'way',
  'your',
]);

export type AssistantAskPlan =
  | {
      outcome: 'answer';
      instruction: string;
      resolvedSubject: AssistantActiveBuffer | null;
      routing: AssistantTurnRouting | null;
      reusePreviousRetrievals: boolean;
    }
  | {
      outcome: 'clarify';
      instruction: string;
      resolvedSubject: AssistantActiveBuffer | null;
      routing: AssistantTurnRouting | null;
      reusePreviousRetrievals: boolean;
    }
  | {
      outcome: 'retrieve';
      instruction: string;
      resolvedSubject: AssistantActiveBuffer;
      requests: AssistantAskRetrievalRequest[];
      routing: AssistantTurnRouting | null;
      reusePreviousRetrievals: boolean;
    };

type AssistantAskPlanInput = {
  prompt: string;
  queryBuffers: AssistantActiveBuffer[];
  rememberedSubject?: AssistantActiveBuffer | null;
  pendingClarification?: AssistantAskClarification | null;
  previousRetrievals?: AssistantAskRetrievalMemory[];
  selectedBuffer?: AssistantActiveBuffer | null;
};

type PlanPromptInput = {
  prompt: string;
  normalizedPrompt: string;
  queryBuffers: AssistantActiveBuffer[];
  rememberedSubject: AssistantActiveBuffer | null;
  pendingClarification: AssistantAskClarification | null;
  previousRetrievals: AssistantAskRetrievalMemory[];
  selectedBuffer: AssistantActiveBuffer | null;
  selectedBufferConfirmed: boolean;
  forcedSubject?: AssistantActiveBuffer | null;
};

type AskPromptAnalysis = {
  generalSubjectChat: boolean;
  retrievalMode: 'none' | 'opening' | 'recent' | 'fact';
  factIntent: AssistantProfileFactIntent | null;
  reusePreviousRetrievals: boolean;
  requests: AssistantAskRetrievalRequest[];
  wantsTranscriptFacts: boolean;
};

export const planAssistantAskTurn = ({
  prompt,
  queryBuffers,
  rememberedSubject = null,
  pendingClarification = null,
  previousRetrievals = [],
  selectedBuffer = null,
}: AssistantAskPlanInput): AssistantAskPlan => {
  const normalizedPrompt = normalizePrompt(prompt);
  const clarifiedPlan = resolvePendingClarification({
    prompt,
    normalizedPrompt,
    queryBuffers,
    rememberedSubject,
    pendingClarification,
    previousRetrievals,
    selectedBuffer,
  });
  if (clarifiedPlan) {
    return clarifiedPlan;
  }
  return planPrompt({
    prompt,
    normalizedPrompt,
    queryBuffers,
    rememberedSubject,
    pendingClarification,
    previousRetrievals,
    selectedBuffer,
    selectedBufferConfirmed: false,
    forcedSubject: null,
  });
};

const planPrompt = ({
  prompt,
  normalizedPrompt,
  queryBuffers,
  rememberedSubject,
  previousRetrievals,
  selectedBuffer,
  selectedBufferConfirmed,
  forcedSubject = null,
}: PlanPromptInput): AssistantAskPlan => {
  const promptSubjectCandidates = findPromptSubjectCandidates(normalizedPrompt, queryBuffers);
  const explicitSubject = promptSubjectCandidates.length === 1 ? promptSubjectCandidates[0] ?? null : null;
  const answerSubject = forcedSubject ?? explicitSubject ?? rememberedSubject ?? null;
  const transcriptSubject = forcedSubject ?? explicitSubject ?? rememberedSubject ?? selectedBuffer ?? null;
  const requestedSubjectHint = extractPromptSubjectHint(prompt);
  const promptAnalysis = analyzeAskPrompt({
    prompt,
    normalizedPrompt,
    previousRetrievals,
    transcriptSubject,
  });

  if (promptSubjectCandidates.length > 1) {
    return {
      outcome: 'clarify',
      instruction: `Ask which private chat the user means: ${formatBufferChoices(promptSubjectCandidates)}.`,
      resolvedSubject: rememberedSubject,
      routing: null,
      reusePreviousRetrievals: false,
    };
  }

  if (isChattyPrompt(normalizedPrompt)) {
    return {
      outcome: 'answer',
      instruction: 'Respond naturally. Do not assume any transcript history unless excerpts are included below.',
      resolvedSubject: answerSubject,
      routing: null,
      reusePreviousRetrievals: false,
    };
  }

  if (promptAnalysis.generalSubjectChat) {
    return {
      outcome: 'answer',
      instruction: answerSubject
        ? `Answer as a normal chat about ${answerSubject.title}. Do not inspect transcript history unless transcript excerpts are explicitly included below.`
        : 'Answer as a normal chat. Do not inspect transcript history unless transcript excerpts are explicitly included below.',
      resolvedSubject: answerSubject,
      routing: null,
      reusePreviousRetrievals: false,
    };
  }

  if (
    explicitSubject
    && selectedBuffer
    && !selectedBufferConfirmed
    && !sameAssistantBuffer(explicitSubject, selectedBuffer)
    && promptAnalysis.retrievalMode !== 'none'
  ) {
    return confirmResolvedSubjectPlan(explicitSubject, prompt, selectedBuffer, rememberedSubject);
  }

  if (promptAnalysis.retrievalMode === 'opening') {
    if (!transcriptSubject) {
      return noBufferClarificationPlan(answerSubject);
    }
    if (requestedSubjectHint && !subjectMatchesHint(transcriptSubject, requestedSubjectHint)) {
      return noKnownSubjectPlan(requestedSubjectHint, answerSubject);
    }
    return {
      outcome: 'retrieve',
      instruction: 'Use the retrieved opening transcript excerpts if they help answer. Keep the answer grounded in those excerpts and cite the key supporting lines.',
      resolvedSubject: transcriptSubject,
      requests: [{
        operation: 'load_opening_buffer_messages',
        limit: openingMessageLimit,
      }],
      routing: null,
      reusePreviousRetrievals: false,
    };
  }

  if (promptAnalysis.retrievalMode === 'recent') {
    if (!transcriptSubject) {
      return noBufferClarificationPlan(answerSubject);
    }
    if (requestedSubjectHint && !subjectMatchesHint(transcriptSubject, requestedSubjectHint)) {
      return noKnownSubjectPlan(requestedSubjectHint, answerSubject);
    }
    return {
      outcome: 'retrieve',
      instruction: 'Use the retrieved recent transcript excerpts if they help answer. Keep the answer grounded in those excerpts and cite the key supporting lines.',
      resolvedSubject: transcriptSubject,
      requests: [{
        operation: 'load_recent_buffer_messages',
        limit: recentMessageLimit,
      }],
      routing: null,
      reusePreviousRetrievals: false,
    };
  }

  if (promptAnalysis.retrievalMode === 'fact') {
    if (!transcriptSubject) {
      if (
        selectedBuffer
        && !selectedBufferConfirmed
        && !isLikelyChannelBuffer(selectedBuffer.target)
      ) {
        return confirmSelectedBufferPlan(selectedBuffer, prompt, rememberedSubject);
      }
      return noBufferClarificationPlan(answerSubject);
    }
    if (requestedSubjectHint && !subjectMatchesHint(transcriptSubject, requestedSubjectHint)) {
      return noKnownSubjectPlan(requestedSubjectHint, answerSubject);
    }
    return {
      outcome: 'retrieve',
      instruction: promptAnalysis.factIntent === 'origin_location'
        ? 'Use the retrieved transcript evidence if it helps answer. Prefer direct stated origin or location answers over thematic inference, and if the opening exchange contains a direct answer, say it plainly.'
        : previousRetrievals.length > 0
          ? 'Use the new transcript evidence together with earlier evidence that still matters. Cite the strongest supporting date or snippet.'
          : 'Use the retrieved transcript evidence if it helps answer. Keep the answer grounded in that evidence, cite the strongest supporting date or snippet, and say plainly when the evidence is weak.',
      resolvedSubject: transcriptSubject,
      requests: promptAnalysis.requests,
      routing: null,
      reusePreviousRetrievals: promptAnalysis.reusePreviousRetrievals,
    };
  }

  if (promptAnalysis.reusePreviousRetrievals) {
    return {
      outcome: 'answer',
      instruction: 'Answer using the transcript evidence that was already loaded earlier in this conversation if it helps. Do not claim access beyond that evidence.',
      resolvedSubject: transcriptSubject,
      routing: null,
      reusePreviousRetrievals: true,
    };
  }

  return {
    outcome: 'answer',
    instruction: transcriptSubject
      ? `You may use the remembered subject ${transcriptSubject.title} for orientation, but no transcript evidence has been loaded for this turn.`
      : 'Answer using only the assistant conversation and any explicit attachments.',
    resolvedSubject: answerSubject,
    routing: null,
    reusePreviousRetrievals: false,
  };
};

const analyzeAskPrompt = ({
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
    return {
      generalSubjectChat: false,
      retrievalMode: 'opening',
      factIntent: null,
      reusePreviousRetrievals: false,
      requests: [],
      wantsTranscriptFacts: true,
    };
  }
  if (isRecentHistoryRequest(normalizedPrompt)) {
    return {
      generalSubjectChat: false,
      retrievalMode: 'recent',
      factIntent: null,
      reusePreviousRetrievals: false,
      requests: [],
      wantsTranscriptFacts: true,
    };
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
      generalSubjectChat: false,
      retrievalMode: 'fact',
      factIntent,
      reusePreviousRetrievals: false,
      requests: buildProfileFactRetrievalRequests(prompt, transcriptSubject, factIntent),
      wantsTranscriptFacts: true,
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
      generalSubjectChat,
      retrievalMode: 'none',
      factIntent: null,
      reusePreviousRetrievals: false,
      requests: [],
      wantsTranscriptFacts: false,
    };
  }

  const requests = buildFactRetrievalRequests(
    prompt,
    transcriptSubject,
    previousRetrievals,
    explicitContinuation,
  );
  if (requests.length > 0) {
    return {
      generalSubjectChat: false,
      retrievalMode: 'fact',
      factIntent: null,
      reusePreviousRetrievals: explicitContinuation,
      requests,
      wantsTranscriptFacts: true,
    };
  }

  if (explicitContinuation) {
    return {
      generalSubjectChat: false,
      retrievalMode: 'none',
      factIntent: null,
      reusePreviousRetrievals: true,
      requests: [],
      wantsTranscriptFacts: true,
    };
  }

  return {
    generalSubjectChat: false,
    retrievalMode: 'none',
    factIntent: null,
    reusePreviousRetrievals: false,
    requests: [],
    wantsTranscriptFacts: true,
  };
};

const resolvePendingClarification = ({
  prompt,
  normalizedPrompt,
  queryBuffers,
  rememberedSubject,
  pendingClarification,
  previousRetrievals,
  selectedBuffer,
}: Omit<PlanPromptInput, 'forcedSubject' | 'selectedBufferConfirmed'>): AssistantAskPlan | null => {
  if (!pendingClarification) {
    return null;
  }
  if (pendingClarification.kind === 'confirmSelectedBufferSubject') {
    if (!selectedBuffer) {
      return noBufferClarificationPlan(rememberedSubject);
    }
    if (isAffirmativePrompt(normalizedPrompt)) {
      return planPrompt({
        prompt: pendingClarification.originalPrompt,
        normalizedPrompt: normalizePrompt(pendingClarification.originalPrompt),
        queryBuffers,
        rememberedSubject,
        pendingClarification: null,
        previousRetrievals,
        selectedBuffer,
        selectedBufferConfirmed: true,
        forcedSubject: selectedBuffer,
      });
    }
    if (isNegativePrompt(normalizedPrompt)) {
      return {
        outcome: 'clarify',
        instruction: 'Ask which private chat the user means instead. Do not inspect any transcript yet.',
        resolvedSubject: rememberedSubject,
        routing: null,
        reusePreviousRetrievals: false,
      };
    }
    if (mentionsBuffer(normalizedPrompt, selectedBuffer)) {
      const mergedPrompt = mergePromptFollowUp(pendingClarification.originalPrompt, prompt);
      return planPrompt({
        prompt: mergedPrompt,
        normalizedPrompt: normalizePrompt(mergedPrompt),
        queryBuffers,
        rememberedSubject: selectedBuffer,
        pendingClarification: null,
        previousRetrievals,
        selectedBuffer,
        selectedBufferConfirmed: true,
        forcedSubject: selectedBuffer,
      });
    }
    return null;
  }
  if (pendingClarification.kind === 'confirmResolvedSubject') {
    const candidate = pendingClarification.candidate;
    if (isAffirmativePrompt(normalizedPrompt) || mentionsBuffer(normalizedPrompt, candidate)) {
      return planPrompt({
        prompt: pendingClarification.originalPrompt,
        normalizedPrompt: normalizePrompt(pendingClarification.originalPrompt),
        queryBuffers,
        rememberedSubject: candidate,
        pendingClarification: null,
        previousRetrievals,
        selectedBuffer,
        selectedBufferConfirmed: true,
        forcedSubject: candidate,
      });
    }
    if (isNegativePrompt(normalizedPrompt)) {
      return {
        outcome: 'clarify',
        instruction: 'Ask which private chat the user wants you to inspect instead. Do not inspect any transcript yet.',
        resolvedSubject: rememberedSubject,
        routing: null,
        reusePreviousRetrievals: false,
      };
    }
    const explicitCandidates = findPromptSubjectCandidates(normalizedPrompt, queryBuffers);
    if (explicitCandidates.length === 1) {
      return planPrompt({
        prompt,
        normalizedPrompt,
        queryBuffers,
        rememberedSubject: explicitCandidates[0] ?? rememberedSubject,
        pendingClarification: null,
        previousRetrievals,
        selectedBuffer,
        selectedBufferConfirmed: true,
        forcedSubject: explicitCandidates[0] ?? null,
      });
    }
  }
  return null;
};

const noBufferClarificationPlan = (resolvedSubject: AssistantActiveBuffer | null): AssistantAskPlan => ({
  outcome: 'clarify',
  instruction: 'Explain that no chat subject is resolved yet, then ask which private chat the user wants you to inspect.',
  resolvedSubject,
  routing: null,
  reusePreviousRetrievals: false,
});

const noKnownSubjectPlan = (
  requestedSubject: string,
  resolvedSubject: AssistantActiveBuffer | null,
): AssistantAskPlan => ({
  outcome: 'clarify',
  instruction: `Explain that no known private chat named ${requestedSubject} is available, then ask which chat the user wants you to inspect.`,
  resolvedSubject,
  routing: null,
  reusePreviousRetrievals: false,
});

const confirmSelectedBufferPlan = (
  selectedBuffer: AssistantActiveBuffer,
  prompt: string,
  resolvedSubject: AssistantActiveBuffer | null,
): AssistantAskPlan => ({
  outcome: 'clarify',
  instruction: `Ask exactly this question and nothing else: "Do you mean your conversation with ${selectedBuffer.title} in the selected buffer?"`,
  resolvedSubject,
  routing: {
    pendingClarification: {
      kind: 'confirmSelectedBufferSubject',
      originalPrompt: prompt,
    },
    retrievals: [],
  },
  reusePreviousRetrievals: false,
});

const confirmResolvedSubjectPlan = (
  candidate: AssistantActiveBuffer,
  prompt: string,
  selectedBuffer: AssistantActiveBuffer,
  resolvedSubject: AssistantActiveBuffer | null,
): AssistantAskPlan => ({
  outcome: 'clarify',
  instruction: `Ask exactly this question and nothing else: "You mentioned ${candidate.title}, but the current buffer is ${selectedBuffer.title}. Search ${candidate.title} instead?"`,
  resolvedSubject,
  routing: {
    pendingClarification: {
      kind: 'confirmResolvedSubject',
      originalPrompt: prompt,
      candidate,
      selectedBuffer,
    },
    retrievals: [],
  },
  reusePreviousRetrievals: false,
});

const buildFactRetrievalRequests = (
  prompt: string,
  subject: AssistantActiveBuffer | null,
  previousRetrievals: AssistantAskRetrievalMemory[],
  reusePreviousSearchTerms: boolean,
) => {
  if (!subject) {
    return [] satisfies AssistantAskRetrievalRequest[];
  }
  const queryAgenda = buildFactQueryAgenda(
    prompt,
    subject,
    reusePreviousSearchTerms ? previousRetrievals : [],
  );
  const requests: AssistantAskRetrievalRequest[] = queryAgenda
    .slice(0, maxFactQueries)
    .map((entry) => ({
      operation: 'fts_search',
      limit: ftsHitLimit,
      query: entry.query,
      searchTerms: entry.searchTerms,
    }));
  const spanTerms = uniqueStrings(queryAgenda.flatMap((entry) => entry.searchTerms)).slice(0, 8);
  requests.push({
    operation: 'span_scan',
    limit: spanScanLimit,
    searchTerms: spanTerms,
  });
  return requests;
};

const buildProfileFactRetrievalRequests = (
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

  const narrowTerms = prioritizeSearchTerms([...promptTerms, ...previousTerms]).slice(0, 4);
  if (narrowTerms.length > 0) {
    agenda.push({
      query: buildFtsQuery(narrowTerms, 'and'),
      searchTerms: narrowTerms,
    });
  }

  const broadTerms = prioritizeSearchTerms([...promptTerms, ...previousTerms]).slice(0, 6);
  if (broadTerms.length > 0) {
    agenda.push({
      query: buildFtsQuery(broadTerms, 'or'),
      searchTerms: broadTerms,
    });
  }

  return dedupeAgenda(agenda);
};


const findPromptSubjectCandidates = (prompt: string, queryBuffers: AssistantActiveBuffer[]) =>
  queryBuffers
    .map((buffer) => ({
      buffer,
      score: scoreBufferMention(prompt, buffer),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.buffer.title.localeCompare(right.buffer.title))
    .map((entry) => entry.buffer);

const scoreBufferMention = (prompt: string, buffer: AssistantActiveBuffer) => {
  const normalizedTarget = buffer.target.toLowerCase();
  const normalizedTitle = buffer.title.toLowerCase();
  if (prompt.includes(normalizedTarget) || prompt.includes(normalizedTitle)) {
    return 4;
  }
  const promptTokens = tokenize(prompt);
  const bufferTokens = new Set([
    ...tokenize(buffer.target),
    ...tokenize(buffer.title),
  ]);
  let bestScore = 0;
  for (const promptToken of promptTokens) {
    for (const bufferToken of bufferTokens) {
      if (promptToken === bufferToken) {
        bestScore = Math.max(bestScore, 3);
        continue;
      }
      if (promptToken.length >= 4 && (bufferToken.startsWith(promptToken) || promptToken.startsWith(bufferToken))) {
        bestScore = Math.max(bestScore, 2);
      }
    }
  }
  return bestScore;
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
  if (intent === 'origin_location') {
    return ['where', 'from', 'live', 'city', 'state', 'country'];
  }
  return [];
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
    if (!sameAssistantBuffer(retrieval.subject, subject)) {
      return [];
    }
    if ('searchTerms' in retrieval.request) {
      return retrieval.request.searchTerms;
    }
    return [];
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
  if (normalized.includes(' ')) {
    return quoteFtsPhrase(normalized);
  }
  return `"${normalized.replace(/"/g, '""')}"*`;
};

const quoteFtsPhrase = (phrase: string) => `"${phrase.trim().replace(/"/g, '""')}"`;

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

const extractQuotedPhrases = (prompt: string) =>
  [...prompt.matchAll(/"([^"\n]{2,80})"/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);

const normalizePrompt = (prompt: string) => prompt.trim().toLowerCase();

const isChattyPrompt = (prompt: string) =>
  /^(?:hi|hello|hey|yo|sup|thanks|thank you|thx|ok|okay|cool|nice|lol|haha|good morning|good night|bye|cya|see you)\b/.test(prompt)
  && wordCount(prompt) <= 6;

const isGeneralSubjectChat = (prompt: string) =>
  /^(?:what can you tell me about|tell me about|what do you think about|thoughts on|who is|describe|how would you describe|what about)\b/.test(prompt)
  || /\b(?:what kind of person|is .* like)\b/.test(prompt);

const isRecentHistoryRequest = (prompt: string) =>
  /\b(?:what happened|what's been going on|whats been going on|what went on|catch me up|recap|summari[sz]e|last night|recent(?:ly)?|latest|earlier today|today|yesterday)\b/.test(prompt);

const isOpeningHistoryRequest = (prompt: string) =>
  /\b(?:beginning|at the beginning|at first|first talked|first started talking|first messages?|opening messages?|how (?:we|i) started|how it started|how we started talking|how i started talking|started talking|start of (?:our|the) conversation|start of (?:our|the) chat)\b/.test(prompt);

const classifyAskFactIntent = (prompt: string, normalizedPrompt: string): AssistantProfileFactIntent | null => {
  if (
    /\bwhere\s+(?:is|was)\b.*\bfrom\b/.test(normalizedPrompt)
    || /\bwhere\s+(?:are|r)\s+you\s+from\b/.test(normalizedPrompt)
    || /\bwhere\s+do(?:es)?\b.*\blive\b/.test(normalizedPrompt)
    || /\bwhat\s+(?:city|state|country)\b/.test(normalizedPrompt)
    || /\b(?:hometown|west coast|east coast)\b/.test(normalizedPrompt)
  ) {
    return 'origin_location';
  }
  const profileTerms = extractProfileFactTerms(prompt, 'origin_location');
  if (profileTerms.some((term) => ['where', 'from', 'live', 'city', 'state', 'country', 'coast', 'hometown'].includes(term))) {
    return 'origin_location';
  }
  return null;
};

const isExplicitEvidenceContinuationPrompt = (prompt: string) =>
  /\b(?:what was it|what was that|what was the one|show me more|quote it|quote that|look closer|look more carefully|more carefully|again|that one|the one|that part|that exchange|that fantasy)\b/.test(prompt)
  || /\bit (?:was|is) related to\b/.test(prompt)
  || /\bit involved\b/.test(prompt)
  || /\bi(?:'ll| will)? give you a hint\b/.test(prompt)
  || /\bhere(?:'s| is) a hint\b/.test(prompt);

const mentionsBuffer = (prompt: string, buffer: AssistantActiveBuffer) =>
  scoreBufferMention(prompt, buffer) > 0;

const isAffirmativePrompt = (prompt: string) =>
  /^(?:yes|yeah|yep|yup|correct|right|exactly|sure|please do|that one|that chat|the selected buffer|search that one)\b/.test(prompt);

const isNegativePrompt = (prompt: string) =>
  /^(?:no|nope|nah|not that|not this|other one|someone else)\b/.test(prompt);

const tokenize = (value: string): string[] => value.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const mergePromptFollowUp = (originalPrompt: string, followUp: string) =>
  `${originalPrompt.trim()}\n${followUp.trim()}`.trim();

const wordCount = (prompt: string) => prompt.split(/\s+/).filter(Boolean).length;

const sameAssistantBuffer = (left: AssistantActiveBuffer | null, right: AssistantActiveBuffer | null) =>
  !!left && !!right && left.bufferId === right.bufferId;

const isLikelyChannelBuffer = (target: string) => /^[#&!+]/.test(target);

const hasQuotedSearch = (prompt: string) => /"[^"\n]{2,80}"/.test(prompt);

const subjectMatchesHint = (subject: AssistantActiveBuffer, hint: string) =>
  subject.target.toLowerCase() === hint.toLowerCase()
  || subject.title.toLowerCase() === hint.toLowerCase()
  || tokenize(subject.target).includes(hint.toLowerCase())
  || tokenize(subject.title).includes(hint.toLowerCase());

const extractPromptSubjectHint = (prompt: string) => {
  const patterns = [
    /\b([A-Z][A-Za-z0-9_-]{2,})\s+and I\b/,
    /\babout\s+([A-Z][A-Za-z0-9_-]{2,})\b/,
    /\bwith\s+([A-Z][A-Za-z0-9_-]{2,})\b/,
    /\b(?:did|does)\s+([A-Z][A-Za-z0-9_-]{2,})\b/,
    /\b(?:what about|tell me about)\s+([A-Z][A-Za-z0-9_-]{2,})\b/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const value = match?.[1]?.trim();
    if (value && !subjectHintNoiseTerms.has(value.toLowerCase())) {
      return value;
    }
  }
  return null;
};

const formatBufferChoices = (buffers: AssistantActiveBuffer[]) => buffers.map((buffer) => buffer.title).join(' or ');
