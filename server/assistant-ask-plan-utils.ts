import type { AssistantActiveBuffer } from '../shared/protocol.js';

export const extractQuotedPhrases = (prompt: string) =>
  [...prompt.matchAll(/"([^"\n]{2,80})"/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);

export const normalizePrompt = (prompt: string) => prompt.trim().toLowerCase();

export const tokenize = (value: string): string[] => value.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export const mergePromptFollowUp = (originalPrompt: string, followUp: string) =>
  `${originalPrompt.trim()}\n${followUp.trim()}`.trim();

export const wordCount = (prompt: string) => prompt.split(/\s+/).filter(Boolean).length;

export const uniqueStrings = (values: string[]) => [...new Set(values.filter(Boolean))];

export const sameAssistantBuffer = (left: AssistantActiveBuffer | null, right: AssistantActiveBuffer | null) =>
  !!left && !!right && left.bufferId === right.bufferId;

export const isLikelyChannelBuffer = (target: string) => /^[#&!+]/.test(target);
