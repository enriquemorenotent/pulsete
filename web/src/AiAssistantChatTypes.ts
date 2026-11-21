import type { AiAssistantContext, AiAssistantMode } from '../../shared/protocol-ai.js';

export const generalContextExpiredMessage = 'The earlier Assistant context expired. Restate any details this question depends on.';

export type AssistantChatConfirmation = { prompt: string; message: string; generalContextExpired?: boolean };

export type AssistantEntry = {
  id: number;
  context?: AiAssistantContext;
  mode?: AiAssistantMode;
  generalContextExpired?: boolean;
  role: 'assistant' | 'user';
  text: string;
};

export type AssistantAskHandler = (
  mode: AiAssistantMode,
  prompt: string,
  label?: string,
  pendingLabel?: string,
  scope?: 'auto' | 'none',
) => void;
