import { z } from 'zod';
import type { BufferState, ChatMessage } from './protocol-chat.js';

export const aiAssistantMessageLimit = 120;
export const aiAssistantPromptMaxLength = 4_000;
export const aiAssistantThreadMaxTurns = 12;
export const aiAssistantTurnTextMaxLength = 4_000;

export const aiAssistantModeSchema = z.enum(['answer', 'suggest-reply']);
export type AiAssistantMode = z.infer<typeof aiAssistantModeSchema>;
export const aiAssistantTurnRoleSchema = z.enum(['assistant', 'user']);
export type AiAssistantTurnRole = z.infer<typeof aiAssistantTurnRoleSchema>;

const aiAssistantChoiceSchema = z.string().trim().min(1).max(100);

export const aiAssistantSelectionSchema = z.object({
  model: aiAssistantChoiceSchema.nullable().default(null),
  reasoningEffort: aiAssistantChoiceSchema.nullable().default(null),
}).strict();
export type AiAssistantSelection = z.infer<typeof aiAssistantSelectionSchema>;

export const aiAssistantTurnSchema = z.object({
  role: aiAssistantTurnRoleSchema,
  text: z.string().max(aiAssistantTurnTextMaxLength),
});
export type AiAssistantTurn = z.infer<typeof aiAssistantTurnSchema>;

export const aiAssistantRequestSchema = z.object({
  assistantTurns: z.array(aiAssistantTurnSchema).max(aiAssistantThreadMaxTurns).default([]),
  mode: aiAssistantModeSchema.default('answer'),
  prompt: z.string().max(aiAssistantPromptMaxLength).default(''),
  selection: aiAssistantSelectionSchema.default({
    model: null,
    reasoningEffort: null,
  }),
});
export type AiAssistantRequest = z.infer<typeof aiAssistantRequestSchema>;

export type AiAssistantModelOption = {
  defaultReasoningEffort: string;
  id: string;
  label: string;
  reasoningEfforts: string[];
};

export type AiAssistantProviderStatus = {
  availableModels: AiAssistantModelOption[];
  connected: boolean;
  detail: string;
  model: string | null;
  modelsError: string | null;
  provider: 'codex-openai-login' | 'unavailable';
  reasoningEffort: string | null;
  selectionNotice: string | null;
};

export type AiAssistantLoginResponse = {
  instructions: string | null;
  status: AiAssistantProviderStatus;
};

export type AiAssistantContext = {
  buffer: Pick<BufferState, 'id' | 'kind' | 'networkId' | 'target'>;
  messages: ChatMessage[];
};

export type AiAssistantResponse = {
  answer: string;
  context: AiAssistantContext;
  mode: AiAssistantMode;
  status: AiAssistantProviderStatus;
};
