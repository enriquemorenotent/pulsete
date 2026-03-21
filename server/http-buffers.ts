import { z } from 'zod';
import { badRequest } from './app-error.js';
import { historyWindowLimit } from '../shared/protocol.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import { normalizeChannelTarget } from './irc-validate.js';
import type { RouteArgs } from './http-types.js';

const queryInputSchema = z.object({
  target: z.string(),
});

const channelInputSchema = z.object({
  channel: z.string(),
  sourceBufferId: z.string().optional(),
});

export const handleBufferRoutes = async ({ req, res, pathname, url, context }: RouteArgs) => {
  const channelMatch = pathname.match(/^\/api\/networks\/([^/]+)\/channels$/);
  if (channelMatch && req.method === 'POST') {
    const networkId = decodeRouteParam(channelMatch[1]);
    const { channel, sourceBufferId } = readChannelTarget(await readJson(req));
    context.runtime.join(networkId, channel, sourceBufferId);
    writeJson(res, 202, { ok: true });
    return true;
  }

  const queryMatch = pathname.match(/^\/api\/networks\/([^/]+)\/queries$/);
  if (queryMatch && req.method === 'POST') {
    const networkId = decodeRouteParam(queryMatch[1]);
    const target = readQueryTarget(await readJson(req));
    writeJson(res, 200, context.runtime.openQueryResult(networkId, target));
    return true;
  }

  const bufferMatch = pathname.match(/^\/api\/buffers\/([^/]+)$/);
  if (bufferMatch && req.method === 'DELETE') {
    const bufferId = decodeRouteParam(bufferMatch[1]);
    writeJson(res, 200, { ok: true, ...context.runtime.closeBufferResult(bufferId) });
    return true;
  }

  const readMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/read$/);
  if (readMatch && req.method === 'POST') {
    writeJson(res, 200, context.runtime.markBufferReadResult(decodeRouteParam(readMatch[1])));
    return true;
  }

  const historyMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history$/);
  if (historyMatch && req.method === 'GET') {
    const bufferId = decodeRouteParam(historyMatch[1]);
    const limit = normalizeHistoryLimit(url.searchParams.get('limit'));
    writeJson(res, 200, {
      messages: context.runtime.history(bufferId, limit),
    });
    return true;
  }

  return false;
};

const normalizeHistoryLimit = (value: string | null) => {
  const limit = Number(value ?? historyWindowLimit);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, historyWindowLimit) : historyWindowLimit;
};

const readChannelTarget = (body: unknown) => {
  const result = channelInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid channel payload');
  }
  return {
    channel: normalizeChannelTarget(result.data.channel),
    sourceBufferId: result.data.sourceBufferId,
  };
};

const readQueryTarget = (body: unknown) => {
  const result = queryInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid query payload');
  }
  return result.data.target;
};
