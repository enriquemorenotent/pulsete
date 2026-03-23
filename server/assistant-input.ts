import { z } from 'zod';
import { assistantTaskKindSchema } from '../shared/protocol.js';
import { badRequest } from './app-error.js';

const nullableThreadId = z.string().trim().min(1).nullable();

const createThreadSchema = z.object({
  bufferId: z.string().trim().min(1).nullable().optional().default(null),
  task: assistantTaskKindSchema,
  model: z.string().trim().min(1).optional(),
});

const turnSchema = z.object({
  prompt: z.string(),
});

const preferencesSchema = z.object({
  defaultModel: z.string().trim().min(1).optional(),
  activeThreadId: nullableThreadId.optional(),
});

export const parseCreateAssistantThreadInput = (body: unknown) => {
  const result = createThreadSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid assistant thread payload');
  }
  return result.data;
};

export const parseAssistantTurnInput = (body: unknown) => {
  const result = turnSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid assistant turn payload');
  }
  return result.data;
};

export const parseAssistantPreferencesInput = (body: unknown) => {
  const result = preferencesSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid assistant preferences payload');
  }
  return result.data;
};
