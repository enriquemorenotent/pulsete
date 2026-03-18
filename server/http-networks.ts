import { z } from 'zod';
import { badRequest } from './app-error.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { NetworkInput } from './storage.js';
import type { RouteArgs } from './http-types.js';

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
  favorite: z.boolean().optional().default(false),
  autoJoin: z.array(z.string()).optional().default([]),
});

export const handleNetworkRoutes = async ({ req, res, pathname, context, session }: RouteArgs) => {
  if (req.method === 'GET' && pathname === '/api/networks') {
    writeJson(res, 200, { networks: context.storage.listNetworks(session!.user.id) });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/networks') {
    const network = context.runtime.saveNetwork(session!.user.id, normalizeNetworkInput(await readJson(req)));
    writeJson(res, 200, { network });
    return true;
  }
  const networkMatch = pathname.match(/^\/api\/networks\/([^/]+)$/);
  if (networkMatch && req.method === 'PUT') {
    const networkId = decodeRouteParam(networkMatch[1]);
    const network = context.runtime.saveNetwork(session!.user.id, normalizeNetworkInput(await readJson(req), networkId));
    writeJson(res, 200, { network });
    return true;
  }
  if (networkMatch && req.method === 'DELETE') {
    const deletedNetworkIds = context.runtime.deleteNetwork(session!.user.id, decodeRouteParam(networkMatch[1]));
    writeJson(res, 200, { ok: true, deletedNetworkIds });
    return true;
  }
  const connectMatch = pathname.match(/^\/api\/networks\/([^/]+)\/(connect|disconnect)$/);
  if (connectMatch && req.method === 'POST') {
    const networkId = decodeRouteParam(connectMatch[1]);
    connectMatch[2] === 'connect'
      ? context.runtime.connect(session!.user.id, networkId)
      : context.runtime.disconnect(session!.user.id, networkId);
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
  return { ...result.data, id };
};
