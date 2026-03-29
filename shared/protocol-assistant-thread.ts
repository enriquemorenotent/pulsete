import { z } from 'zod';
import {
  assistantAuthSchema,
  assistantActiveBufferSchema,
  assistantItemSchema,
  assistantModelSchema,
  assistantRateLimitsSchema,
  assistantServiceStatusSchema,
  assistantTaskKindSchema,
  assistantThreadScopeSchema,
  assistantTurnStatusSchema,
} from './protocol-assistant-core.js';
import { assistantTurnRoutingSchema } from './protocol-assistant-ask.js';

export const assistantTurnSchema = z.object({
  id: z.string(),
  status: assistantTurnStatusSchema,
  error: z.string().nullable(),
  items: z.array(assistantItemSchema),
  activeBuffer: assistantActiveBufferSchema.nullable().optional(),
  resolvedSubject: assistantActiveBufferSchema.nullable().optional(),
  routing: assistantTurnRoutingSchema.nullable().optional(),
});
export type AssistantTurn = z.infer<typeof assistantTurnSchema>;

export const assistantThreadSummarySchema = z.object({
  id: z.string(),
  bufferId: z.string().nullable(),
  networkId: z.string().nullable(),
  target: z.string().nullable(),
  scope: assistantThreadScopeSchema,
  title: z.string(),
  task: assistantTaskKindSchema,
  model: z.string(),
  turnStatus: assistantTurnStatusSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type AssistantThreadSummary = z.infer<typeof assistantThreadSummarySchema>;

export const assistantThreadSchema = assistantThreadSummarySchema.extend({
  turns: z.array(assistantTurnSchema),
});
export type AssistantThread = z.infer<typeof assistantThreadSchema>;

export const assistantPreferencesSchema = z.object({
  defaultModel: z.string(),
  activeThreadId: z.string().nullable(),
});
export type AssistantPreferences = z.infer<typeof assistantPreferencesSchema>;

export const assistantSnapshotSchema = z.object({
  serviceStatus: assistantServiceStatusSchema,
  serviceError: z.string().nullable(),
  auth: assistantAuthSchema,
  rateLimits: assistantRateLimitsSchema.nullable(),
  rateLimitBuckets: z.array(assistantRateLimitsSchema),
  models: z.array(assistantModelSchema),
  defaultModel: z.string(),
  activeThreadId: z.string().nullable(),
  threads: z.array(assistantThreadSummarySchema),
});
export type AssistantSnapshot = z.infer<typeof assistantSnapshotSchema>;
