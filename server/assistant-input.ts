import { z } from 'zod';
import { assistantTaskKindSchema, assistantTurnAttachmentInputSchema } from '../shared/protocol.js';
import { badRequest } from './app-error.js';

export const assistantRequestBodyLimitBytes = 20 * 1024 * 1024;

const nullableThreadId = z.string().trim().min(1).nullable();

const createThreadSchema = z.object({
  bufferId: z.string().trim().min(1).nullable().optional().default(null),
  task: assistantTaskKindSchema,
  model: z.string().trim().min(1).optional(),
});

const turnSchema = z.object({
  prompt: z.string(),
  attachments: z.array(assistantTurnAttachmentInputSchema).max(3).optional().default([]),
});

const importSchema = z.object({
  prompt: z.string().optional().default(''),
  attachments: z.array(assistantTurnAttachmentInputSchema)
    .min(1, 'Attach at least one log file to import')
    .max(3)
    .superRefine((attachments, context) => {
      for (const attachment of attachments) {
        if (attachment.kind !== 'text') {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Only text log files can be imported into chat history',
          });
          return;
        }
      }
    }),
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

export const parseAssistantImportInput = (body: unknown) => {
  const result = importSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid assistant import payload');
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
