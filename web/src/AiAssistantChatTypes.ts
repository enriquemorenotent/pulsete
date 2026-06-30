import type { AiAssistantMode } from '../../shared/protocol-ai.js';

export type AssistantEntry = {
  id: number;
  mode?: AiAssistantMode;
  role: 'assistant' | 'user';
  text: string;
};

export type AssistantAskHandler = (
  mode: AiAssistantMode,
  prompt: string,
  label?: string,
  pendingLabel?: string,
) => void;
