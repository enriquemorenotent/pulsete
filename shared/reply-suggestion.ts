import { z } from 'zod';
import type { ChatMessage } from './protocol-chat.js';

export const replySuggestionRequestSchema = z.object({
  messageId: z.string().min(1).max(512),
}).strict();

export type ReplySuggestionResponse = { suggestion: string | null };

export const isReplySuggestionText = (message: ChatMessage) =>
  message.kind === 'line'
  && !message.importBatchId
  && message.delivery !== 'server-history'
  && !!message.body.trim();

export const isIncomingReplySuggestionText = (message: ChatMessage) =>
  isReplySuggestionText(message)
  && !message.self
  && message.speakerRole !== 'self'
  && !!message.nick;
