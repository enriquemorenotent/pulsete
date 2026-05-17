import { z } from 'zod';
import { networkAuthMethodSchema } from '../shared/protocol-chat.js';
import { badRequest } from './app-error.js';
import { normalizeAuthTarget, normalizeChannelTarget, requireIrcToken, requireSingleLineValue } from './irc-validate.js';
import type { NetworkInput } from './storage-types.js';

const networkInputSchema = z.object({
  workspaceOpen: z.boolean().optional(),
  name: z.string().trim().min(1, 'Network name is required'),
  host: z.string().trim().min(1, 'Server address is required'),
  port: z.number().int().positive('Port must be a positive integer'),
  tls: z.boolean(),
  nick: z.string().trim().min(1, 'Nick name is required'),
  username: z.string().trim().optional(),
  altNicks: z.array(z.string()).optional().default([]),
  historicalSelfNicks: z.array(z.string()).optional().default([]),
  realName: z.string().optional().default(''),
  authMethod: networkAuthMethodSchema.optional(),
  authTarget: z.string().trim().optional(),
  authAccount: z.string().trim().optional(),
  password: z.string().optional(),
  clearPassword: z.boolean().optional().default(false),
  favorite: z.boolean().optional().default(false),
  autoJoin: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
}).refine((input) => input.password === undefined || input.password.length > 0, {
  message: 'Password cannot be empty',
  path: ['password'],
}).refine((input) => !(input.password !== undefined && input.clearPassword), {
  message: 'Password cannot be updated and cleared in the same request',
  path: ['clearPassword'],
});

export const parseNetworkInput = (body: unknown, id?: string): NetworkInput => {
  const bodyId =
    body && typeof body === 'object' && 'id' in body && typeof body.id === 'string'
      ? body.id
      : undefined;
  const result = networkInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid network payload');
  }
  const data = result.data;
  requireSingleLineValue(data.name, 'Network name cannot contain carriage returns or line feeds');
  requireSingleLineValue(data.host, 'Server address cannot contain carriage returns or line feeds');
  requireIrcToken(data.nick, 'Nick name cannot contain whitespace');
  if (data.username) {
    requireIrcToken(data.username, 'Username cannot contain whitespace');
  }
  for (const altNick of data.altNicks) {
    requireIrcToken(altNick, 'Alternate nick cannot contain whitespace');
  }
  for (const historicalNick of data.historicalSelfNicks) {
    requireIrcToken(historicalNick, 'Historical self nick cannot contain whitespace');
  }
  requireSingleLineValue(data.realName, 'Real name cannot contain carriage returns or line feeds');
  if (data.authTarget) {
    normalizeAuthTarget(data.authTarget);
  }
  if (data.authAccount) {
    requireIrcToken(data.authAccount, 'Authentication account cannot contain whitespace');
  }
  if (data.password !== undefined) {
    requireSingleLineValue(data.password, 'Password cannot contain carriage returns or line feeds');
  }
  return {
    ...data,
    autoJoin: data.autoJoin.map((channel) => normalizeChannelTarget(channel)),
    id: id ?? bodyId,
  };
};
