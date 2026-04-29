import { z } from 'zod';
import { badRequest } from './app-error.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

const nickEmojiInputSchema = z.object({
  emoji: z.string().nullable(),
});

export const handleNickEmojiRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  const match = pathname.match(/^\/api\/networks\/([^/]+)\/nick-emojis\/([^/]+)$/);
  if (!match || req.method !== 'PUT') {
    return false;
  }
  const networkId = decodeRouteParam(match[1]);
  const nick = decodeRouteParam(match[2]);
  const emoji = readNickEmoji(await readJson(req));
  writeJson(res, 200, context.nickEmojis.save(networkId, nick, emoji));
  return true;
};

const readNickEmoji = (body: unknown) => {
  const result = nickEmojiInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid nick emoji payload');
  }
  return result.data.emoji;
};
