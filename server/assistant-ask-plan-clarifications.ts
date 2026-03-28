import { mentionsBuffer } from './assistant-ask-plan-subjects.js';
import {
  confirmSelectedBufferPlan,
  noBufferClarificationPlan,
} from './assistant-ask-plan-subjects.js';
import type {
  AssistantAskPlan,
  PlanPromptResolver,
  ResolvePendingClarificationInput,
} from './assistant-ask-plan-types.js';
import {
  isAffirmativePrompt,
  isNegativePrompt,
} from './assistant-ask-plan-prompts.js';
import { normalizePrompt, mergePromptFollowUp } from './assistant-ask-plan-utils.js';
import { findPromptSubjectCandidates } from './assistant-ask-plan-subjects.js';

export const resolvePendingClarification = (
  {
    prompt,
    normalizedPrompt,
    queryBuffers,
    rememberedSubject,
    pendingClarification,
    previousRetrievals,
    selectedBuffer,
  }: ResolvePendingClarificationInput,
  planPrompt: PlanPromptResolver,
): AssistantAskPlan | null => {
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
        previousRetrievals,
        selectedBuffer,
        selectedBufferConfirmed: true,
        forcedSubject: selectedBuffer,
      });
    }
    return null;
  }
  const candidate = pendingClarification.candidate;
  if (isAffirmativePrompt(normalizedPrompt) || mentionsBuffer(normalizedPrompt, candidate)) {
    return planPrompt({
      prompt: pendingClarification.originalPrompt,
      normalizedPrompt: normalizePrompt(pendingClarification.originalPrompt),
      queryBuffers,
      rememberedSubject: candidate,
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
      previousRetrievals,
      selectedBuffer,
      selectedBufferConfirmed: true,
      forcedSubject: explicitCandidates[0] ?? null,
    });
  }
  return null;
};
