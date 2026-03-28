import { analyzeAskPrompt } from './assistant-ask-plan-analysis.js';
import { resolvePendingClarification } from './assistant-ask-plan-clarifications.js';
import {
  openingMessageLimit,
  recentMessageLimit,
} from './assistant-ask-plan-constants.js';
import {
  confirmResolvedSubjectPlan,
  confirmSelectedBufferPlan,
  extractPromptSubjectHint,
  findPromptSubjectCandidates,
  formatBufferChoices,
  noBufferClarificationPlan,
  noKnownSubjectPlan,
  subjectMatchesHint,
} from './assistant-ask-plan-subjects.js';
import type {
  AssistantAskPlan,
  AssistantAskPlanInput,
  PlanPromptInput,
} from './assistant-ask-plan-types.js';
import { isChattyPrompt } from './assistant-ask-plan-analysis.js';
import {
  isLikelyChannelBuffer,
  normalizePrompt,
  sameAssistantBuffer,
} from './assistant-ask-plan-utils.js';

export type { AssistantAskPlan } from './assistant-ask-plan-types.js';

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
  }, planPrompt);
  if (clarifiedPlan) {
    return clarifiedPlan;
  }
  return planPrompt({
    prompt,
    normalizedPrompt,
    queryBuffers,
    rememberedSubject,
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
  if (explicitSubject && selectedBuffer && !selectedBufferConfirmed && !sameAssistantBuffer(explicitSubject, selectedBuffer) && promptAnalysis.retrievalMode !== 'none') {
    return confirmResolvedSubjectPlan(explicitSubject, prompt, selectedBuffer, rememberedSubject);
  }
  if (promptAnalysis.retrievalMode === 'opening' || promptAnalysis.retrievalMode === 'recent') {
    return planWindowRetrieval(promptAnalysis.retrievalMode, transcriptSubject, requestedSubjectHint, answerSubject);
  }
  if (promptAnalysis.retrievalMode === 'fact') {
    if (!transcriptSubject) {
      return selectedBuffer && !selectedBufferConfirmed && !isLikelyChannelBuffer(selectedBuffer.target)
        ? confirmSelectedBufferPlan(selectedBuffer, prompt, rememberedSubject)
        : noBufferClarificationPlan(answerSubject);
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

const planWindowRetrieval = (
  mode: 'opening' | 'recent',
  transcriptSubject: PlanPromptInput['rememberedSubject'],
  requestedSubjectHint: string | null,
  answerSubject: PlanPromptInput['rememberedSubject'],
): AssistantAskPlan => {
  if (!transcriptSubject) {
    return noBufferClarificationPlan(answerSubject);
  }
  if (requestedSubjectHint && !subjectMatchesHint(transcriptSubject, requestedSubjectHint)) {
    return noKnownSubjectPlan(requestedSubjectHint, answerSubject);
  }
  return {
    outcome: 'retrieve',
    instruction: mode === 'opening'
      ? 'Use the retrieved opening transcript excerpts if they help answer. Keep the answer grounded in those excerpts and cite the key supporting lines.'
      : 'Use the retrieved recent transcript excerpts if they help answer. Keep the answer grounded in those excerpts and cite the key supporting lines.',
    resolvedSubject: transcriptSubject,
    requests: [{
      operation: mode === 'opening' ? 'load_opening_buffer_messages' : 'load_recent_buffer_messages',
      limit: mode === 'opening' ? openingMessageLimit : recentMessageLimit,
    }],
    routing: null,
    reusePreviousRetrievals: false,
  };
};
