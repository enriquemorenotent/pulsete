import { z } from 'zod';

export const historyWindowLimit = 250;

export const messageKindSchema = z.enum(['line', 'join', 'part', 'notice', 'error', 'system']);
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

export const appSnapshotSchema = z.object({
  networks: z.array(networkSchema),
  friends: z.array(friendSchema),
  friendPresence: z.record(z.boolean()),
  buffers: z.array(bufferSchema),
  channels: z.array(channelSchema),
  pendingChannels: z.array(pendingChannelSchema).default([]),
  messages: z.array(chatMessageSchema),
  networkStates: z.record(networkRuntimeStateSchema),
});
export type AppSnapshot = z.infer<typeof appSnapshotSchema>;
