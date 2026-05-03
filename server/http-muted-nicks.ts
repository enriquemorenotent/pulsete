import { z } from 'zod';
import { networkUserIdentitySchema } from '../shared/user-identity.js';
import { badRequest } from './app-error.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

const mutedNickInputSchema = z.object({
  networkId: z.string(),
  nick: z.string(),
  identity: networkUserIdentitySchema.nullable().optional(),
});

export const handleMutedNickRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (pathname === '/api/muted-nicks' && req.method === 'POST') {
    const { networkId, nick, identity } = readMutedNickInput(await readJson(req));
    writeJson(res, 200, context.mutedNicks.add(networkId, nick, identity));
    return true;
  }

  const mutedNickMatch = pathname.match(/^\/api\/muted-nicks\/([^/]+)$/);
  if (mutedNickMatch && req.method === 'DELETE') {
    const mutedNickId = decodeRouteParam(mutedNickMatch[1]);
    writeJson(res, 200, { ok: true, ...context.mutedNicks.remove(mutedNickId) });
    return true;
  }

  return false;
};

const readMutedNickInput = (body: unknown) => {
  const result = mutedNickInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid muted nick payload');
  }
  return result.data;
};
