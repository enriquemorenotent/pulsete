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

export const aiAssistantTurnSchema = z.object({
  role: aiAssistantTurnRoleSchema,
  text: z.string().max(aiAssistantTurnTextMaxLength),
});
export type AiAssistantTurn = z.infer<typeof aiAssistantTurnSchema>;

export const aiAssistantRequestSchema = z.object({
  assistantTurns: z.array(aiAssistantTurnSchema).max(aiAssistantThreadMaxTurns).default([]),
  mode: aiAssistantModeSchema.default('answer'),
  prompt: z.string().max(aiAssistantPromptMaxLength).default(''),
});
export type AiAssistantRequest = z.infer<typeof aiAssistantRequestSchema>;

export type AiAssistantProviderStatus = {
  connected: boolean;
  detail: string;
  model: string | null;
  provider: 'codex-openai-login' | 'unavailable';
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
