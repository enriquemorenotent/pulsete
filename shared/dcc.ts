import { z } from 'zod';

export const dccMaxBytes = 0xffff_ffff;

export const dccSendRequestSchema = z.strictObject({
  bufferId: z.string().min(1),
  advertisedAddress: z.string().max(64).optional(),
  port: z.number().int().min(1).max(65535).optional(),
});

export const dccTransferSchema = z.object({
  id: z.string(),
  networkId: z.string(),
  bufferId: z.string().optional(),
  networkName: z.string(),
  peer: z.string(),
  filename: z.string(),
  address: z.string(),
  port: z.number(),
  size: z.number(),
  bytes: z.number(),
  direction: z.enum(['send', 'receive']),
  status: z.enum(['offered', 'choosing', 'waiting', 'connecting', 'transferring', 'completed', 'declined', 'cancelled', 'failed']),
  error: z.string().optional(),
});

export const dccStateSchema = z.object({
  enabled: z.boolean(),
  transfers: z.array(dccTransferSchema),
});

export type DccState = z.infer<typeof dccStateSchema>;
export type DccTransfer = z.infer<typeof dccTransferSchema>;
export type DccSendRequest = z.infer<typeof dccSendRequestSchema>;

export type DccFileDialog =
  | { kind: 'send'; peer: string }
  | { kind: 'receive'; filename: string };

export type PickDccFile = (request: DccFileDialog) => Promise<string | null>;
