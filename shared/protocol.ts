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

const networkRuntimeStateSchema = z.object({
  connected: z.boolean(),
  connecting: z.boolean(),
  serverName: z.string().nullable(),
  nick: z.string(),
});

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

const baseClientSchema = z.object({
  type: z.string(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  baseClientSchema.extend({
    type: z.literal('network.connect'),
    networkId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('network.disconnect'),
    networkId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.join'),
    networkId: z.string(),
    channel: z.string(),
    sourceBufferId: z.string().optional(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.part'),
    networkId: z.string(),
    channel: z.string(),
    sourceBufferId: z.string().optional(),
  }),
  baseClientSchema.extend({
    type: z.literal('query.open'),
    networkId: z.string(),
    target: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('message.send'),
    networkId: z.string(),
    target: z.string(),
    body: z.string(),
    kind: z.enum(['message', 'action']).default('message'),
    sourceBufferId: z.string().optional(),
  }),
  baseClientSchema.extend({
    type: z.literal('raw.send'),
    networkId: z.string(),
    raw: z.string(),
    sourceBufferId: z.string().optional(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.list.request'),
    networkId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.list.cancel'),
    networkId: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  baseClientSchema.extend({
    type: z.literal('state.ready'),
    snapshot: appSnapshotSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('network.state'),
    networkId: z.string(),
    connected: z.boolean(),
    serverName: z.string().nullable(),
    nick: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('network.remove'),
    networkId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('network.upsert'),
    network: networkSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('friend.upsert'),
    friend: friendSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('friend.remove'),
    friendId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('friend.presence'),
    friendId: z.string(),
    online: z.boolean(),
  }),
  baseClientSchema.extend({
    type: z.literal('buffer.upsert'),
    buffer: bufferSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('buffer.remove'),
    networkId: z.string(),
    bufferId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.snapshot'),
    channel: channelSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('channel.pending'),
    pendingChannel: pendingChannelSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('channel.pending.remove'),
    networkId: z.string(),
    channel: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.list.started'),
    networkId: z.string(),
    requestId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.list.entry'),
    networkId: z.string(),
    requestId: z.string(),
    entry: channelListEntrySchema,
  }),
  baseClientSchema.extend({
    type: z.literal('channel.list.completed'),
    networkId: z.string(),
    requestId: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('channel.list.failed'),
    networkId: z.string(),
    requestId: z.string(),
    message: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('message.append'),
    message: chatMessageSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('presence.update'),
    networkId: z.string(),
    channel: z.string(),
    users: z.array(channelUserSchema),
  }),
  baseClientSchema.extend({
    type: z.literal('notice'),
    networkId: z.string().nullable(),
    message: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('error'),
    networkId: z.string().nullable(),
    message: z.string(),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

export const encode = (message: ClientMessage | ServerMessage) => JSON.stringify(message);

export const decodeClient = (payload: string) => clientMessageSchema.parse(JSON.parse(payload));

export const decodeServer = (payload: string) => serverMessageSchema.parse(JSON.parse(payload));
