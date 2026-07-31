import { z } from 'zod';
import { badRequest } from './app-error.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import { maxDraftCharacters } from '../shared/protocol-preferences.js';

const draftInputSchema = z.object({
  body: z.string().max(maxDraftCharacters),
}).strict();

export const handleDraftRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  const match = pathname.match(/^\/api\/buffers\/([^/]+)\/draft$/);
  if (!match || req.method !== 'PUT') {
    return false;
  }
  const result = draftInputSchema.safeParse(await readJson(req));
  if (!result.success) {
    throw badRequest('Invalid draft payload');
  }
  writeJson(res, 200, context.drafts.save(decodeRouteParam(match[1]), result.data.body));
  return true;
};
