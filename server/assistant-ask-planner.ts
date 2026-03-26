import type {
  AssistantActiveBuffer,
  AssistantAskClarification,
  AssistantAskEvidenceLine,
  AssistantAskEvidenceGroup,
  AssistantAskRetrievalMemory,
  AssistantAskRetrievalRequest,
  AssistantProfileFactIntent,
  AssistantTurnRouting,
  ChatMessage,
} from '../shared/protocol.js';
import { getTranscriptSpeakerLabel } from '../shared/message-speaker.js';
import {
  extractProfileFactTerms,
  extractSearchTerms,
  formatTimestamp,
  matchesTerm,
  termWeight,
} from './assistant-history-context.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';

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
  return renderLegacySearchResults(subject, resolveAllMessages(subject, conversations, messages), request.searchTerms, request.limit);
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

const renderLegacySearchResults = (
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
    stage: 'legacy_search',
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
