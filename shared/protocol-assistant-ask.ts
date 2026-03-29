import { z } from 'zod';
import {
  assistantActiveBufferSchema,
  messageKindSchema,
  speakerAttributionConfidenceSchema,
  speakerRoleSchema,
} from './protocol-assistant-core.js';

export const assistantAskClarificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('confirmSelectedBufferSubject'),
    originalPrompt: z.string(),
  }),
  z.object({
    kind: z.literal('confirmResolvedSubject'),
    originalPrompt: z.string(),
    candidate: assistantActiveBufferSchema,
    selectedBuffer: assistantActiveBufferSchema.nullable().optional(),
  }),
]);
export type AssistantAskClarification = z.infer<
  typeof assistantAskClarificationSchema
>;

export const assistantProfileFactIntentSchema = z.enum(['origin_location']);
export type AssistantProfileFactIntent = z.infer<
  typeof assistantProfileFactIntentSchema
>;

export const assistantAskRetrievalRequestSchema = z.discriminatedUnion(
  'operation',
  [
    z.object({
      operation: z.literal('load_recent_buffer_messages'),
      limit: z.number().int().positive(),
    }),
    z.object({
      operation: z.literal('load_opening_buffer_messages'),
      limit: z.number().int().positive(),
    }),
    z.object({
      operation: z.literal('profile_fact_search'),
      intent: assistantProfileFactIntentSchema,
      limit: z.number().int().positive(),
      query: z.string(),
      searchTerms: z.array(z.string()),
    }),
    z.object({
      operation: z.literal('fts_search'),
      limit: z.number().int().positive(),
      query: z.string(),
      searchTerms: z.array(z.string()),
    }),
    z.object({
      operation: z.literal('message_window'),
      messageId: z.string(),
      before: z.number().int().nonnegative(),
      after: z.number().int().nonnegative(),
    }),
    z.object({
      operation: z.literal('span_scan'),
      limit: z.number().int().positive(),
      searchTerms: z.array(z.string()),
    }),
    z.object({
      operation: z.literal('search_buffer'),
      limit: z.number().int().positive(),
      searchTerms: z.array(z.string()),
    }),
  ],
);
export type AssistantAskRetrievalRequest = z.infer<
  typeof assistantAskRetrievalRequestSchema
>;

export const assistantAskEvidenceLineSchema = z.object({
  messageId: z.string(),
  speakerRole: speakerRoleSchema.optional(),
  speakerNick: z.string().nullable().optional(),
  attributionConfidence: speakerAttributionConfidenceSchema.optional(),
  body: z.string(),
  kind: messageKindSchema,
});
export type AssistantAskEvidenceLine = z.infer<typeof assistantAskEvidenceLineSchema>;

export const assistantAskEvidenceGroupSchema = z.object({
  heading: z.string(),
  lines: z.array(assistantAskEvidenceLineSchema).default([]),
});
export type AssistantAskEvidenceGroup = z.infer<typeof assistantAskEvidenceGroupSchema>;

export const assistantAskRetrievalMemorySchema = z.object({
  subject: assistantActiveBufferSchema,
  request: assistantAskRetrievalRequestSchema,
  context: z.string(),
  stage: z.string().default(''),
  query: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
  scoreSummary: z.string().default(''),
  matchCount: z.number().int().nonnegative().default(0),
  matchedMessageIds: z.array(z.string()).default([]),
  windowMessageIds: z.array(z.array(z.string())).default([]),
  evidenceMessageIds: z.array(z.string()).default([]),
  evidenceGroups: z.array(assistantAskEvidenceGroupSchema).default([]).optional(),
});
export type AssistantAskRetrievalMemory = z.infer<
  typeof assistantAskRetrievalMemorySchema
>;

export const assistantTurnRoutingSchema = z.object({
  pendingClarification: assistantAskClarificationSchema.nullable().optional(),
  retrieval: assistantAskRetrievalMemorySchema.nullable().optional(),
  retrievals: z.array(assistantAskRetrievalMemorySchema).default([]),
});
export type AssistantTurnRouting = z.infer<typeof assistantTurnRoutingSchema>;
