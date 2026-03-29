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
  z.object({ type: z.literal('apiKey') }),
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
  assistantAttachmentMetadataBaseSchema.extend({ kind: z.literal('text') }),
  assistantAttachmentMetadataBaseSchema.extend({ kind: z.literal('image') }),
]);
export type AssistantAttachmentMetadata = z.infer<typeof assistantAttachmentMetadataSchema>;

export const assistantTurnAttachmentInputSchema = z.discriminatedUnion('kind', [
  assistantAttachmentMetadataBaseSchema.extend({
    kind: z.literal('text'),
    text: z.string(),
  }),
  assistantAttachmentMetadataBaseSchema.extend({
    kind: z.literal('image'),
    dataUrl: z
      .string()
      .regex(/^data:image\//, 'Image attachment must be encoded as a data URL'),
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
  z.object({ type: z.literal('plan'), id: z.string(), text: z.string() }),
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

export {
  messageKindSchema,
  speakerAttributionConfidenceSchema,
  speakerRoleSchema,
};
