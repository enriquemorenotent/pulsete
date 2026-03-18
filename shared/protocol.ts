import { z } from 'zod';

export const historyWindowLimit = 250;

export const messageKindSchema = z.enum(['line', 'join', 'part', 'notice', 'error', 'system']);

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
  password: z.string().optional(),
  favorite: z.boolean().default(false),
  autoJoin: z.array(z.string()),
});

export type NetworkProfile = z.infer<typeof networkSchema>;

export const channelSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  name: z.string(),
  topic: z.string().default(''),
  unread: z.number().int().nonnegative().default(0),
  users: z.array(z.string()).default([]),
});

export type ChannelState = z.infer<typeof channelSchema>;

export const querySchema = z.object({
  id: z.string(),
  networkId: z.string(),
  target: z.string(),
});

export type QueryBuffer = z.infer<typeof querySchema>;

export const appSnapshotSchema = z.object({
  user: z.object({
    id: z.string(),
    username: z.string(),
  }),
  networks: z.array(networkSchema),
  channels: z.array(channelSchema),
  queries: z.array(querySchema),
  messages: z.array(chatMessageSchema),
  activeNetworkId: z.string().nullable(),
  activeBuffer: z.string(),
  bootstrapped: z.boolean(),
});

export type AppSnapshot = z.infer<typeof appSnapshotSchema>;

const baseClientSchema = z.object({
  type: z.string(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  baseClientSchema.extend({
    type: z.literal('session.init'),
    token: z.string().nullable(),
  }),
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
  }),
  baseClientSchema.extend({
    type: z.literal('channel.part'),
    networkId: z.string(),
    channel: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('query.open'),
    networkId: z.string(),
    target: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('query.close'),
    networkId: z.string(),
    target: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('message.send'),
    networkId: z.string(),
    target: z.string(),
    body: z.string(),
    kind: z.enum(['message', 'action']).default('message'),
  }),
  baseClientSchema.extend({
    type: z.literal('raw.send'),
    networkId: z.string(),
    raw: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('state.request'),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  baseClientSchema.extend({
    type: z.literal('session.ready'),
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
    type: z.literal('channel.snapshot'),
    channel: channelSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('channel.remove'),
    networkId: z.string(),
    channelId: z.string(),
    channel: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('query.open'),
    query: querySchema,
  }),
  baseClientSchema.extend({
    type: z.literal('query.close'),
    networkId: z.string(),
    target: z.string(),
  }),
  baseClientSchema.extend({
    type: z.literal('message.append'),
    message: chatMessageSchema,
  }),
  baseClientSchema.extend({
    type: z.literal('presence.update'),
    networkId: z.string(),
    channel: z.string(),
    users: z.array(z.string()),
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
