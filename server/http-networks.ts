import { z } from 'zod';
import { badRequest } from './app-error.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import { normalizeChannelTarget, requireIrcToken, requireSingleLineValue } from './irc-validate.js';
import type { NetworkInput } from './storage.js';
import type { RouteArgs } from './http-types.js';
import { getSessionTokenFromRequest, requireLiveSessionFromRequest } from './session-utils.js';

const networkInputSchema = z.object({
  templateId: z.string().nullable().optional().default(null),
  managerHidden: z.boolean().optional().default(false),
  name: z.string().trim().min(1, 'Network name is required'),
  host: z.string().trim().min(1, 'Server address is required'),
  port: z.number().int().positive('Port must be a positive integer'),
  tls: z.boolean(),
  nick: z.string().trim().min(1, 'Nick name is required'),
  altNicks: z.array(z.string()).optional().default([]),
  username: z.string().trim().min(1, 'Username is required'),
  realName: z.string().optional().default(''),
  password: z.string().optional(),
  clearPassword: z.boolean().optional().default(false),
  favorite: z.boolean().optional().default(false),
  autoJoin: z.array(z.string()).optional().default([]),
}).refine((input) => input.password === undefined || input.password.length > 0, {
  message: 'Password cannot be empty',
  path: ['password'],
}).refine((input) => !(input.password !== undefined && input.clearPassword), {
  message: 'Password cannot be updated and cleared in the same request',
  path: ['clearPassword'],
});

export const handleNetworkRoutes = async ({ req, res, pathname, context, session }: RouteArgs) => {
  const getUserId = () => requireLiveSessionFromRequest(context.storage, req, session?.user.id).user.id;
  if (req.method === 'GET' && pathname === '/api/networks') {
    writeJson(res, 200, { networks: context.storage.listNetworks(getUserId()) });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/networks') {
    const input = normalizeNetworkInput(await readJson(req));
    const network = context.runtime.saveNetwork(getUserId(), input);
    writeJson(res, 200, { network });
    return true;
  }
  const networkMatch = pathname.match(/^\/api\/networks\/([^/]+)$/);
  if (networkMatch && req.method === 'PUT') {
    const networkId = decodeRouteParam(networkMatch[1]);
    const input = normalizeNetworkInput(await readJson(req), networkId);
    const network = context.runtime.saveNetwork(getUserId(), input);
    writeJson(res, 200, { network });
    return true;
  }
  if (networkMatch && req.method === 'DELETE') {
    const deletedNetworkIds = context.runtime.deleteNetwork(getUserId(), decodeRouteParam(networkMatch[1]));
    writeJson(res, 200, { ok: true, deletedNetworkIds });
    return true;
  }
  const connectMatch = pathname.match(/^\/api\/networks\/([^/]+)\/(connect|disconnect)$/);
  if (connectMatch && req.method === 'POST') {
    const networkId = decodeRouteParam(connectMatch[1]);
    const sessionToken = getSessionTokenFromRequest(req) ?? undefined;
    const userId = getUserId();
    connectMatch[2] === 'connect'
      ? context.runtime.connect(userId, networkId, sessionToken)
      : context.runtime.disconnect(userId, networkId);
    writeJson(res, 200, { ok: true });
    return true;
  }
  return false;
};

const normalizeNetworkInput = (body: unknown, id?: string): NetworkInput => {
  const result = networkInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid network payload');
  }
  const data = result.data;
  requireSingleLineValue(data.name, 'Network name cannot contain carriage returns or line feeds');
  requireSingleLineValue(data.host, 'Server address cannot contain carriage returns or line feeds');
  requireIrcToken(data.nick, 'Nick name cannot contain whitespace');
  for (const altNick of data.altNicks) {
    requireIrcToken(altNick, 'Alternate nick cannot contain whitespace');
  }
  requireIrcToken(data.username, 'Username cannot contain whitespace');
  requireSingleLineValue(data.realName, 'Real name cannot contain carriage returns or line feeds');
  if (data.password !== undefined) {
    requireIrcToken(data.password, 'Password cannot contain whitespace');
  }
  return {
    ...data,
    autoJoin: data.autoJoin.map((channel) => normalizeChannelTarget(channel)),
    id,
  };
};
