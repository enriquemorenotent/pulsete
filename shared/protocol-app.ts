import { z } from 'zod';
import {
  bufferSchema,
  channelSchema,
  chatMessageSchema,
  friendSchema,
  mutedNickSchema,
  networkRuntimeStateSchema,
  networkSchema,
  nickEmojiSchema,
  pendingChannelSchema,
  presenceStatusSchema,
} from './protocol-chat.js';

export const appSnapshotSchema = z.object({
  networks: z.array(networkSchema),
  friends: z.array(friendSchema),
  mutedNicks: z.array(mutedNickSchema).default([]),
  nickEmojis: z.array(nickEmojiSchema).default([]),
  friendPresence: z.record(presenceStatusSchema),
  queryPresence: z.record(presenceStatusSchema).default({}),
  buffers: z.array(bufferSchema),
  channels: z.array(channelSchema),
  pendingChannels: z.array(pendingChannelSchema).default([]),
  messages: z.array(chatMessageSchema),
  networkStates: z.record(networkRuntimeStateSchema),
});
export type AppSnapshot = z.infer<typeof appSnapshotSchema>;
