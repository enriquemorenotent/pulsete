import { z } from 'zod';
import { networkUserIdentitySchema } from './user-identity.js';

export const historyWindowLimit = 250;
export const historySearchLimit = 50;
export const historySearchContextBefore = 2;
export const historySearchContextAfter = 2;

export const messageKindSchema = z.enum(['line', 'action', 'join', 'part', 'quit', 'notice', 'error', 'system']);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const speakerRoleSchema = z.enum(['self', 'peer', 'other', 'unknown']);
export type SpeakerRole = z.infer<typeof speakerRoleSchema>;

export const speakerAttributionSourceSchema = z.enum([
  'runtime',
  'query-alias',
  'query-target',
  'import-alias',
  'unknown',
]);
export type SpeakerAttributionSource = z.infer<typeof speakerAttributionSourceSchema>;

export const speakerAttributionConfidenceSchema = z.enum(['high', 'low']);
export type SpeakerAttributionConfidence = z.infer<typeof speakerAttributionConfidenceSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  bufferId: z.string(),
  networkId: z.string(),
  target: z.string(),
  nick: z.string().nullable(),
  senderIdentity: networkUserIdentitySchema.nullable().optional(),
  speakerRole: speakerRoleSchema.optional(),
  speakerNick: z.string().nullable().optional(),
  attributionSource: speakerAttributionSourceSchema.optional(),
  attributionConfidence: speakerAttributionConfidenceSchema.optional(),
  importBatchId: z.string().nullable().optional(),
  body: z.string(),
  kind: messageKindSchema,
  self: z.boolean(),
  ts: z.number(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export type BufferHistorySearchResult = {
  message: ChatMessage;
  context: ChatMessage[];
};

export type BufferHistorySearchPayload = {
  query: string;
  results: BufferHistorySearchResult[];
  hasMore: boolean;
};

export const networkAuthMethodSchema = z.enum(['none', 'server-pass', 'nickserv', 'sasl-plain']);
export type NetworkAuthMethod = z.infer<typeof networkAuthMethodSchema>;

export const networkSchema = z.object({
  id: z.string(),
  workspaceOpen: z.boolean().default(false),
  name: z.string(),
  host: z.string(),
  port: z.number().int().positive(),
  tls: z.boolean(),
  nick: z.string(),
  altNicks: z.array(z.string()).default([]),
  historicalSelfNicks: z.array(z.string()).default([]).optional(),
  realName: z.string().default(''),
  hasPassword: z.boolean().default(false),
  authMethod: networkAuthMethodSchema.optional(),
  authTarget: z.string().optional(),
  authAccount: z.string().optional(),
  favorite: z.boolean().default(false),
  autoJoin: z.array(z.string()),
  notes: z.string().optional(),
});
export type NetworkProfile = z.infer<typeof networkSchema>;

export const friendSchema = z.object({
  id: z.string(),
  nick: z.string(),
});
export type FriendState = z.infer<typeof friendSchema>;

export const mutedNickSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  nick: z.string(),
  identity: networkUserIdentitySchema.optional(),
});
export type MutedNickState = z.infer<typeof mutedNickSchema>;

export const nickEmojiSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  nick: z.string(),
  identity: networkUserIdentitySchema.optional(),
  emoji: z.string(),
});
export type NickEmojiState = z.infer<typeof nickEmojiSchema>;

export const presenceStatusSchema = z.enum(['online', 'away', 'offline']);
export type PresenceStatus = z.infer<typeof presenceStatusSchema>;

export const channelUserPrivilegeModeSchema = z.enum(['owner', 'admin', 'op', 'halfop', 'voice']);
export type ChannelUserPrivilegeMode = z.infer<typeof channelUserPrivilegeModeSchema>;

export const channelUserModeSchema = z.enum(['owner', 'admin', 'op', 'halfop', 'voice', 'normal']);
export type ChannelUserMode = z.infer<typeof channelUserModeSchema>;

export const channelUserSchema = z.object({
  nick: z.string(),
  mode: channelUserModeSchema.default('normal'),
  modes: z.array(channelUserPrivilegeModeSchema).default([]).optional(),
  away: z.boolean().default(false),
  account: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  host: z.string().nullable().optional(),
  identity: networkUserIdentitySchema.optional(),
  realname: z.string().nullable().optional(),
});
export type ChannelUserState = z.infer<typeof channelUserSchema>;

export const bufferKindSchema = z.enum(['server', 'channel', 'query']);
export const bufferSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  kind: bufferKindSchema,
  target: z.string(),
  notes: z.string().optional(),
  unread: z.number().int().nonnegative().default(0),
  priorityUnread: z.number().int().nonnegative().default(0),
  lastReadTs: z.number().int().nonnegative().nullable().default(null),
  lastReadMessageId: z.string().nullable().default(null),
  peerIdentity: networkUserIdentitySchema.optional(),
  selfNickAliases: z.array(z.string()).default([]).optional(),
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

export const networkRuntimeCapabilitiesSchema = z.object({
  offered: z.array(z.string()).default([]),
  negotiated: z.array(z.string()).default([]),
  pending: z.array(z.string()).default([]),
});
export type NetworkRuntimeCapabilities = z.infer<typeof networkRuntimeCapabilitiesSchema>;

export const emptyNetworkRuntimeCapabilities = (): NetworkRuntimeCapabilities => ({
  offered: [],
  negotiated: [],
  pending: [],
});

export const networkRuntimeStateSchema = z.object({
  phase: networkRuntimePhaseSchema,
  serverName: z.string().nullable(),
  nick: z.string(),
  capabilities: networkRuntimeCapabilitiesSchema.optional(),
});
export type NetworkRuntimeState = z.infer<typeof networkRuntimeStateSchema>;
