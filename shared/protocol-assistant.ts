import { z } from 'zod';
import {
  messageKindSchema,
  speakerAttributionConfidenceSchema,
  speakerRoleSchema,
} from './protocol-chat.js';

export const assistantTaskKindSchema = z.enum(['ask', 'summarize', 'draft']);
export type AssistantTaskKind = z.infer<typeof assistantTaskKindSchema>;

export const assistantThreadScopeSchema = z.enum(['buffer', 'free']);
export type AssistantThreadScope = z.infer<typeof assistantThreadScopeSchema>;

export const assistantServiceStatusSchema = z.enum(['starting', 'ready', 'error']);
export type AssistantServiceStatus = z.infer<typeof assistantServiceStatusSchema>;

export const assistantPlanTypeSchema = z.enum([
  'free',
  'go',
  'plus',
  'pro',
  'team',
  'business',
  'enterprise',
  'edu',
  'unknown',
]);
export type AssistantPlanType = z.infer<typeof assistantPlanTypeSchema>;

export const assistantAccountSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('apiKey'),
  }),
  z.object({
    type: z.literal('chatgpt'),
    email: z.string(),
    planType: assistantPlanTypeSchema,
  }),
]);
export type AssistantAccount = z.infer<typeof assistantAccountSchema>;

export const assistantCreditsSchema = z.object({
  hasCredits: z.boolean(),
  unlimited: z.boolean(),
  balance: z.string().nullable(),
});
export type AssistantCredits = z.infer<typeof assistantCreditsSchema>;

export const assistantRateLimitWindowSchema = z.object({
  usedPercent: z.number(),
  windowDurationMins: z.number().nullable(),
  resetsAt: z.number().nullable(),
});
export type AssistantRateLimitWindow = z.infer<typeof assistantRateLimitWindowSchema>;

export const assistantRateLimitsSchema = z.object({
  limitId: z.string().nullable(),
  limitName: z.string().nullable(),
  primary: assistantRateLimitWindowSchema.nullable(),
  secondary: assistantRateLimitWindowSchema.nullable(),
  credits: assistantCreditsSchema.nullable(),
  planType: assistantPlanTypeSchema.nullable(),
});
export type AssistantRateLimits = z.infer<typeof assistantRateLimitsSchema>;

export const assistantAuthSchema = z.object({
  requiresOpenaiAuth: z.boolean(),
  account: assistantAccountSchema.nullable(),
  pendingLoginId: z.string().nullable(),
  pendingAuthUrl: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type AssistantAuth = z.infer<typeof assistantAuthSchema>;

export const assistantModelSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  isDefault: z.boolean(),
  hidden: z.boolean(),
});
export type AssistantModel = z.infer<typeof assistantModelSchema>;

export const assistantTurnStatusSchema = z.enum([
  'inProgress',
  'completed',
  'failed',
  'interrupted',
]);
export type AssistantTurnStatus = z.infer<typeof assistantTurnStatusSchema>;

export const assistantSummaryArtifactSchema = z.object({
  type: z.literal('summary'),
  summary: z.string(),
  highlights: z.array(z.string()),
});
export type AssistantSummaryArtifact = z.infer<typeof assistantSummaryArtifactSchema>;

export const assistantDraftArtifactSchema = z.object({
  type: z.literal('draft'),
  draft: z.string(),
});
export type AssistantDraftArtifact = z.infer<typeof assistantDraftArtifactSchema>;

export const assistantArtifactSchema = z.discriminatedUnion('type', [
  assistantSummaryArtifactSchema,
  assistantDraftArtifactSchema,
]);
export type AssistantArtifact = z.infer<typeof assistantArtifactSchema>;

const assistantAttachmentMetadataBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});

export const assistantAttachmentMetadataSchema = z.discriminatedUnion('kind', [
  assistantAttachmentMetadataBaseSchema.extend({
    kind: z.literal('text'),
  }),
  assistantAttachmentMetadataBaseSchema.extend({
    kind: z.literal('image'),
  }),
]);
export type AssistantAttachmentMetadata = z.infer<typeof assistantAttachmentMetadataSchema>;

export const assistantTurnAttachmentInputSchema = z.discriminatedUnion('kind', [
  assistantAttachmentMetadataBaseSchema.extend({
    kind: z.literal('text'),
    text: z.string(),
  }),
  assistantAttachmentMetadataBaseSchema.extend({
    kind: z.literal('image'),
    dataUrl: z.string().regex(/^data:image\//, 'Image attachment must be encoded as a data URL'),
  }),
]);
export type AssistantTurnAttachmentInput = z.infer<typeof assistantTurnAttachmentInputSchema>;

export const assistantItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('userMessage'),
    id: z.string(),
    text: z.string(),
    attachments: z.array(assistantAttachmentMetadataSchema).default([]),
  }),
  z.object({
    type: z.literal('agentMessage'),
    id: z.string(),
    text: z.string(),
    phase: z.string().nullable(),
    artifact: assistantArtifactSchema.nullable(),
  }),
  z.object({
    type: z.literal('plan'),
    id: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('reasoning'),
    id: z.string(),
    summary: z.array(z.string()),
    content: z.array(z.string()),
  }),
  z.object({
    type: z.literal('other'),
    id: z.string(),
    label: z.string(),
    text: z.string(),
  }),
]);
export type AssistantItem = z.infer<typeof assistantItemSchema>;

export const assistantActiveBufferSchema = z.object({
  bufferId: z.string(),
  networkId: z.string(),
  target: z.string(),
  title: z.string(),
});
export type AssistantActiveBuffer = z.infer<typeof assistantActiveBufferSchema>;

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
export type AssistantAskClarification = z.infer<typeof assistantAskClarificationSchema>;

export const assistantProfileFactIntentSchema = z.enum([
  'origin_location',
]);
export type AssistantProfileFactIntent = z.infer<typeof assistantProfileFactIntentSchema>;

export const assistantAskRetrievalRequestSchema = z.discriminatedUnion('operation', [
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
]);
export type AssistantAskRetrievalRequest = z.infer<typeof assistantAskRetrievalRequestSchema>;

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
export type AssistantAskRetrievalMemory = z.infer<typeof assistantAskRetrievalMemorySchema>;

export const assistantTurnRoutingSchema = z.object({
  pendingClarification: assistantAskClarificationSchema.nullable().optional(),
  retrieval: assistantAskRetrievalMemorySchema.nullable().optional(),
  retrievals: z.array(assistantAskRetrievalMemorySchema).default([]),
});
export type AssistantTurnRouting = z.infer<typeof assistantTurnRoutingSchema>;

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
