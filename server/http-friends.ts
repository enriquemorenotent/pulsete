import { z } from 'zod';
import { badRequest } from './app-error.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

const friendInputSchema = z.object({
  nick: z.string(),
});

export const handleFriendRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (pathname === '/api/friends' && req.method === 'POST') {
    const nick = readFriendNick(await readJson(req));
    writeJson(res, 200, context.friends.add(nick));
    return true;
  }

  const friendMatch = pathname.match(/^\/api\/friends\/([^/]+)$/);
  if (friendMatch && req.method === 'DELETE') {
    const friendId = decodeRouteParam(friendMatch[1]);
    writeJson(res, 200, { ok: true, ...context.friends.remove(friendId) });
    return true;
  }

  return false;
};

const readFriendNick = (body: unknown) => {
  const result = friendInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid friend payload');
  }
  return result.data.nick;
};
