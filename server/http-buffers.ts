import { z } from 'zod';
import { badRequest } from './app-error.js';
import { historyWindowLimit } from '../shared/protocol.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import { requireLiveSessionFromRequest } from './session-utils.js';

const queryInputSchema = z.object({
  target: z.string(),
});

export const handleBufferRoutes = async ({ req, res, pathname, url, context, session }: RouteArgs) => {
  const getUserId = () => requireLiveSessionFromRequest(context.storage, req, session?.user.id).user.id;
  const queryMatch = pathname.match(/^\/api\/networks\/([^/]+)\/queries$/);
  if (queryMatch && req.method === 'POST') {
    const networkId = decodeRouteParam(queryMatch[1]);
    const target = readQueryTarget(await readJson(req));
    const userId = getUserId();
    const query = context.runtime.openQuery(userId, networkId, target);
    context.runtime.send(userId, { type: 'query.open', query });
    writeJson(res, 200, { query });
    return true;
  }
  const singleQueryMatch = pathname.match(/^\/api\/networks\/([^/]+)\/queries\/([^/]+)$/);
  if (singleQueryMatch && req.method === 'DELETE') {
    const networkId = decodeRouteParam(singleQueryMatch[1]);
    const target = decodeRouteParam(singleQueryMatch[2]);
    const userId = getUserId();
    context.runtime.closeQuery(userId, networkId, target);
    context.runtime.send(userId, { type: 'query.close', networkId, target });
    writeJson(res, 200, { ok: true });
    return true;
  }
  const readMatch = pathname.match(/^\/api\/channels\/([^/]+)\/read$/);
  if (readMatch && req.method === 'POST') {
    context.runtime.markChannelRead(getUserId(), decodeRouteParam(readMatch[1]));
    writeJson(res, 200, { ok: true });
    return true;
  }
  const historyMatch = pathname.match(/^\/api\/networks\/([^/]+)\/history$/);
  if (historyMatch && req.method === 'GET') {
    const networkId = decodeRouteParam(historyMatch[1]);
    const target = String(url.searchParams.get('target') ?? 'server');
    const limit = normalizeHistoryLimit(url.searchParams.get('limit'));
    writeJson(res, 200, {
      messages: context.runtime.history(getUserId(), networkId, target, limit),
    });
    return true;
  }
  return false;
};

const normalizeHistoryLimit = (value: string | null) => {
  const limit = Number(value ?? historyWindowLimit);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, historyWindowLimit) : historyWindowLimit;
};

const readQueryTarget = (body: unknown) => {
  const result = queryInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid query payload');
  }
  return result.data.target;
};
