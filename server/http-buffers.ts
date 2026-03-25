import { z } from 'zod';
import {
  bufferHistoryImportRequestSchema,
  bufferSelfNickAliasesRequestSchema,
  historyImportRequestBodyLimitBytes,
} from '../shared/protocol.js';
import { badRequest } from './app-error.js';
import { historyWindowLimit } from '../shared/protocol.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import { normalizeChannelTarget } from './irc-validate.js';
import type { RouteArgs } from './http-types.js';
import type { ServerResponse } from 'node:http';

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
    context.buffers.joinChannel(networkId, channel, sourceBufferId);
    writeJson(res, 202, { ok: true });
    return true;
  }

  const queryMatch = pathname.match(/^\/api\/networks\/([^/]+)\/queries$/);
  if (queryMatch && req.method === 'POST') {
    const networkId = decodeRouteParam(queryMatch[1]);
    const target = readQueryTarget(await readJson(req));
    writeJson(res, 200, context.buffers.openQuery(networkId, target));
    return true;
  }

  const bufferMatch = pathname.match(/^\/api\/buffers\/([^/]+)$/);
  if (bufferMatch && req.method === 'DELETE') {
    const bufferId = decodeRouteParam(bufferMatch[1]);
    writeJson(res, 200, { ok: true, ...context.buffers.close(bufferId) });
    return true;
  }

  const readMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/read$/);
  if (readMatch && req.method === 'POST') {
    writeJson(res, 200, context.buffers.markRead(decodeRouteParam(readMatch[1])));
    return true;
  }

  const historyMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history$/);
  const downloadMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history\/download$/);
  if (historyMatch && req.method === 'DELETE') {
    const bufferId = decodeRouteParam(historyMatch[1]);
    writeJson(res, 200, { ok: true, ...context.buffers.clearHistory(bufferId) });
    return true;
  }

  if (downloadMatch && req.method === 'GET') {
    const bufferId = decodeRouteParam(downloadMatch[1]);
    const download = context.buffers.exportHistory(bufferId);
    writeTextDownload(res, download.fileName, download.content);
    return true;
  }

  const importMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history\/import$/);
  if (importMatch && req.method === 'POST') {
    const bufferId = decodeRouteParam(importMatch[1]);
    const input = readHistoryImportInput(await readJson(req, historyImportRequestBodyLimitBytes));
    writeJson(res, 200, { ok: true, ...context.buffers.importHistory(bufferId, input) });
    return true;
  }

  const selfNickAliasesMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/self-nick-aliases$/);
  if (selfNickAliasesMatch && req.method === 'PUT') {
    const bufferId = decodeRouteParam(selfNickAliasesMatch[1]);
    const input = readBufferSelfNickAliasesInput(await readJson(req));
    writeJson(res, 200, { ok: true, ...context.buffers.updateQuerySelfNickAliases(bufferId, input) });
    return true;
  }

  if (historyMatch && req.method === 'GET') {
    const bufferId = decodeRouteParam(historyMatch[1]);
    const limit = normalizeHistoryLimit(url.searchParams.get('limit'));
    const beforeMessageId = normalizeHistoryBefore(url.searchParams.get('before'));
    writeJson(res, 200, context.buffers.history(bufferId, limit, beforeMessageId));
    return true;
  }

  return false;
};

const normalizeHistoryLimit = (value: string | null) => {
  const limit = Number(value ?? historyWindowLimit);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, historyWindowLimit) : historyWindowLimit;
};

const normalizeHistoryBefore = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

const readHistoryImportInput = (body: unknown) => {
  const result = bufferHistoryImportRequestSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid history import payload');
  }
  return result.data;
};

const readBufferSelfNickAliasesInput = (body: unknown) => {
  const result = bufferSelfNickAliasesRequestSchema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid self alias payload');
  }
  return result.data;
};

const writeTextDownload = (res: ServerResponse, fileName: string, content: string) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${escapeContentDisposition(fileName)}"`);
  res.end(content);
};

const escapeContentDisposition = (value: string) => value.replace(/["\\]/g, '');
