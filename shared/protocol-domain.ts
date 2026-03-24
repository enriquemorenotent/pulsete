import { z } from 'zod';

export const historyWindowLimit = 250;

export const messageKindSchema = z.enum(['line', 'action', 'join', 'part', 'notice', 'error', 'system']);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  target: z.string(),
  nick: z.string().nullable(),
  body: z.string(),
  kind: messageKindSchema,
  self: z.boolean(),
  ts: z.number(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const networkAuthMethodSchema = z.enum(['none', 'server-pass', 'nickserv', 'sasl-plain']);
export type NetworkAuthMethod = z.infer<typeof networkAuthMethodSchema>;

export const networkSchema = z.object({
  id: z.string(),
  templateId: z.string().nullable().default(null),
  managerHidden: z.boolean().default(false),
  name: z.string(),
  host: z.string(),
  port: z.number().int().positive(),
  tls: z.boolean(),
  nick: z.string(),
  altNicks: z.array(z.string()).default([]),
  username: z.string(),
  realName: z.string().default(''),
  hasPassword: z.boolean().default(false),
  authMethod: networkAuthMethodSchema.optional(),
  authTarget: z.string().optional(),
  authAccount: z.string().optional(),
  favorite: z.boolean().default(false),
  autoJoin: z.array(z.string()),
});
export type NetworkProfile = z.infer<typeof networkSchema>;

export const friendSchema = z.object({
  id: z.string(),
  nick: z.string(),
});
export type FriendState = z.infer<typeof friendSchema>;

export const channelUserModeSchema = z.enum(['owner', 'admin', 'op', 'halfop', 'voice', 'normal']);
export type ChannelUserMode = z.infer<typeof channelUserModeSchema>;

export const channelUserSchema = z.object({
  nick: z.string(),
  mode: channelUserModeSchema.default('normal'),
});
export type ChannelUserState = z.infer<typeof channelUserSchema>;

export const bufferKindSchema = z.enum(['server', 'channel', 'query']);
export const bufferSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  kind: bufferKindSchema,
  target: z.string(),
  unread: z.number().int().nonnegative().default(0),
});
export type BufferState = z.infer<typeof bufferSchema>;

export const channelSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  name: z.string(),
  topic: z.string().default(''),
  users: z.array(channelUserSchema).default([]),
});
export type ChannelState = z.infer<typeof channelSchema>;

export const channelListEntrySchema = z.object({
  name: z.string(),
  users: z.number().int().nonnegative(),
  topic: z.string().default(''),
});
export type ChannelListEntry = z.infer<typeof channelListEntrySchema>;

export const pendingChannelSchema = z.object({
  networkId: z.string(),
  channel: z.string(),
});
export type PendingChannelState = z.infer<typeof pendingChannelSchema>;

export const networkRuntimePhaseSchema = z.enum(['offline', 'connecting', 'connected']);
export type NetworkRuntimePhase = z.infer<typeof networkRuntimePhaseSchema>;

export const networkRuntimeStateSchema = z.object({
  phase: networkRuntimePhaseSchema,
  serverName: z.string().nullable(),
  nick: z.string(),
});
export type NetworkRuntimeState = z.infer<typeof networkRuntimeStateSchema>;

export const assistantTaskKindSchema = z.enum(['ask', 'summarize', 'draft']);
export type AssistantTaskKind = z.infer<typeof assistantTaskKindSchema>;

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

export const assistantTurnSchema = z.object({
  id: z.string(),
  status: assistantTurnStatusSchema,
  error: z.string().nullable(),
  items: z.array(assistantItemSchema),
});
export type AssistantTurn = z.infer<typeof assistantTurnSchema>;

export const assistantThreadSummarySchema = z.object({
  id: z.string(),
  bufferId: z.string().nullable(),
  networkId: z.string().nullable(),
  target: z.string().nullable(),
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

export const appSnapshotSchema = z.object({
  networks: z.array(networkSchema),
  friends: z.array(friendSchema),
  friendPresence: z.record(z.boolean()),
  buffers: z.array(bufferSchema),
  channels: z.array(channelSchema),
  pendingChannels: z.array(pendingChannelSchema).default([]),
  messages: z.array(chatMessageSchema),
  networkStates: z.record(networkRuntimeStateSchema),
  assistant: assistantSnapshotSchema,
});
export type AppSnapshot = z.infer<typeof appSnapshotSchema>;
