import { z } from 'zod';
import { badRequest } from './app-error.js';
import { historyWindowLimit } from '../shared/protocol-chat.js';
import { networkUserIdentitySchema } from '../shared/user-identity.js';
import {
  normalizeHistorySearchLimit,
  normalizeHistorySearchQuery,
} from './http-history-search.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import { normalizeChannelTarget } from './irc-validate.js';
import type { RouteArgs } from './http-types.js';
import type { ServerResponse } from 'node:http';

const queryInputSchema = z.object({
  target: z.string(),
  peerIdentity: networkUserIdentitySchema.nullable().optional(),
});

const channelInputSchema = z.object({
  channel: z.string(),
  sourceBufferId: z.string().optional(),
});

const bufferNotesInputSchema = z.object({
  notes: z.string(),
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
    const query = readQueryTarget(await readJson(req));
    writeJson(res, 200, context.buffers.openQuery(networkId, query.target, query.peerIdentity));
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

  const notesMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/notes$/);
  if (notesMatch && req.method === 'PUT') {
    const bufferId = decodeRouteParam(notesMatch[1]);
    const { notes } = readBufferNotes(await readJson(req));
    writeJson(res, 200, context.buffers.saveNotes(bufferId, notes));
    return true;
  }

  const historyMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history$/);
  const historySearchMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history\/search$/);
  const downloadMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history\/download$/);
  const pinsMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/pins$/);
  const messagePinMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/messages\/([^/]+)\/pin$/);
  const messageWindowMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/history\/around\/([^/]+)$/);

  if (pinsMatch && req.method === 'GET') {
    writeJson(res, 200, context.buffers.listPinnedMessages(decodeRouteParam(pinsMatch[1])));
    return true;
  }

  if (messagePinMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
    const bufferId = decodeRouteParam(messagePinMatch[1]);
    const messageId = decodeRouteParam(messagePinMatch[2]);
    writeJson(
      res,
      200,
      context.buffers.setMessagePinned(bufferId, messageId, req.method === 'PUT'),
    );
    return true;
  }

  if (messageWindowMatch && req.method === 'GET') {
    const bufferId = decodeRouteParam(messageWindowMatch[1]);
    const messageId = decodeRouteParam(messageWindowMatch[2]);
    writeJson(res, 200, context.buffers.pinnedMessageHistoryWindow(bufferId, messageId));
    return true;
  }
  if (historyMatch && req.method === 'DELETE') {
    const bufferId = decodeRouteParam(historyMatch[1]);
    writeJson(res, 200, { ok: true, ...context.buffers.clearHistory(bufferId) });
    return true;
  }

  if (historySearchMatch && req.method === 'GET') {
    const bufferId = decodeRouteParam(historySearchMatch[1]);
    const query = normalizeHistorySearchQuery(url.searchParams.get('q'));
    const limit = normalizeHistorySearchLimit(url.searchParams.get('limit'));
    writeJson(res, 200, context.buffers.searchHistory(bufferId, query, limit));
    return true;
  }

  if (downloadMatch && req.method === 'GET') {
    const bufferId = decodeRouteParam(downloadMatch[1]);
    const download = context.buffers.exportHistory(bufferId);
    writeTextDownload(res, download.fileName, download.content);
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
  return result.data;
};

const readBufferNotes = (body: unknown) => {
  const result = bufferNotesInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid buffer notes payload');
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
