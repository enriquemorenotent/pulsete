import type { AssistantActiveBuffer } from '../shared/protocol.js';
import { subjectHintNoiseTerms } from './assistant-ask-plan-constants.js';
import type { AssistantAskPlan } from './assistant-ask-plan-types.js';
import { tokenize } from './assistant-ask-plan-utils.js';

export const findPromptSubjectCandidates = (prompt: string, queryBuffers: AssistantActiveBuffer[]) =>
  queryBuffers
    .map((buffer) => ({
      buffer,
      score: scoreBufferMention(prompt, buffer),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.buffer.title.localeCompare(right.buffer.title))
    .map((entry) => entry.buffer);

export const scoreBufferMention = (prompt: string, buffer: AssistantActiveBuffer) => {
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

export const subjectMatchesHint = (subject: AssistantActiveBuffer, hint: string) =>
  subject.target.toLowerCase() === hint.toLowerCase()
  || subject.title.toLowerCase() === hint.toLowerCase()
  || tokenize(subject.target).includes(hint.toLowerCase())
  || tokenize(subject.title).includes(hint.toLowerCase());

export const mentionsBuffer = (prompt: string, buffer: AssistantActiveBuffer) =>
  scoreBufferMention(prompt, buffer) > 0;

export const extractPromptSubjectHint = (prompt: string) => {
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

export const noBufferClarificationPlan = (resolvedSubject: AssistantActiveBuffer | null): AssistantAskPlan => ({
  outcome: 'clarify',
  instruction: 'Explain that no chat subject is resolved yet, then ask which private chat the user wants you to inspect.',
  resolvedSubject,
  routing: null,
  reusePreviousRetrievals: false,
});

export const noKnownSubjectPlan = (
  requestedSubject: string,
  resolvedSubject: AssistantActiveBuffer | null,
): AssistantAskPlan => ({
  outcome: 'clarify',
  instruction: `Explain that no known private chat named ${requestedSubject} is available, then ask which chat the user wants you to inspect.`,
  resolvedSubject,
  routing: null,
  reusePreviousRetrievals: false,
});

export const confirmSelectedBufferPlan = (
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

export const confirmResolvedSubjectPlan = (
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

export const formatBufferChoices = (buffers: AssistantActiveBuffer[]) => buffers.map((buffer) => buffer.title).join(' or ');
