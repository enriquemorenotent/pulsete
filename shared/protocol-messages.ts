import { z } from 'zod';
import {
  appSnapshotSchema,
  bufferSchema,
  channelListEntrySchema,
  channelSchema,
  channelUserSchema,
  chatMessageSchema,
  friendSchema,
  networkRuntimePhaseSchema,
  networkSchema,
  pendingChannelSchema,
} from './protocol-domain.js';

const baseClientSchema = z.object({
  type: z.string(),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  baseClientSchema.extend({ type: z.literal('network.connect'), networkId: z.string() }),
  baseClientSchema.extend({ type: z.literal('network.disconnect'), networkId: z.string() }),
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
  baseClientSchema.extend({ type: z.literal('query.open'), networkId: z.string(), target: z.string() }),
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
  baseClientSchema.extend({ type: z.literal('channel.list.request'), networkId: z.string() }),
  baseClientSchema.extend({ type: z.literal('channel.list.cancel'), networkId: z.string() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion('type', [
  baseClientSchema.extend({ type: z.literal('state.ready'), snapshot: appSnapshotSchema }),
  baseClientSchema.extend({
    type: z.literal('network.state'),
    networkId: z.string(),
    phase: networkRuntimePhaseSchema,
    serverName: z.string().nullable(),
    nick: z.string(),
  }),
  baseClientSchema.extend({ type: z.literal('network.remove'), networkId: z.string() }),
  baseClientSchema.extend({ type: z.literal('network.upsert'), network: networkSchema }),
  baseClientSchema.extend({ type: z.literal('friend.upsert'), friend: friendSchema }),
  baseClientSchema.extend({ type: z.literal('friend.remove'), friendId: z.string() }),
  baseClientSchema.extend({ type: z.literal('friend.presence'), friendId: z.string(), online: z.boolean() }),
  baseClientSchema.extend({ type: z.literal('buffer.upsert'), buffer: bufferSchema }),
  baseClientSchema.extend({
    type: z.literal('buffer.remove'),
    networkId: z.string(),
    bufferId: z.string(),
  }),
  baseClientSchema.extend({ type: z.literal('channel.snapshot'), channel: channelSchema }),
  baseClientSchema.extend({ type: z.literal('channel.pending'), pendingChannel: pendingChannelSchema }),
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
  baseClientSchema.extend({ type: z.literal('message.append'), message: chatMessageSchema }),
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
