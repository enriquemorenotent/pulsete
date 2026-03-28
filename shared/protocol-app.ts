import { z } from 'zod';
import { assistantSnapshotSchema } from './protocol-assistant.js';
import {
  bufferSchema,
  channelSchema,
  chatMessageSchema,
  friendSchema,
  networkRuntimeStateSchema,
  networkSchema,
  pendingChannelSchema,
  presenceStatusSchema,
} from './protocol-chat.js';

export const appSnapshotSchema = z.object({
  networks: z.array(networkSchema),
  friends: z.array(friendSchema),
  friendPresence: z.record(presenceStatusSchema),
  queryPresence: z.record(presenceStatusSchema).default({}),
  buffers: z.array(bufferSchema),
  channels: z.array(channelSchema),
  pendingChannels: z.array(pendingChannelSchema).default([]),
  messages: z.array(chatMessageSchema),
  networkStates: z.record(networkRuntimeStateSchema),
  assistant: assistantSnapshotSchema,
});
export type AppSnapshot = z.infer<typeof appSnapshotSchema>;
