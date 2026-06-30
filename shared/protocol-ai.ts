import { z } from 'zod';
import type { BufferState, ChatMessage } from './protocol-chat.js';

export const aiAssistantMessageLimit = 120;
export const aiAssistantPromptMaxLength = 4_000;

export const aiAssistantModeSchema = z.enum(['answer', 'suggest-reply']);
export type AiAssistantMode = z.infer<typeof aiAssistantModeSchema>;

export const aiAssistantRequestSchema = z.object({
  mode: aiAssistantModeSchema.default('answer'),
  prompt: z.string().max(aiAssistantPromptMaxLength).default(''),
});
export type AiAssistantRequest = z.infer<typeof aiAssistantRequestSchema>;

export type AiAssistantProviderStatus = {
  connected: boolean;
  detail: string;
  model: string | null;
  provider: 'openai-api-key' | 'unavailable';
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
