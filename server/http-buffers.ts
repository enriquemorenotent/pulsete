import { isChannelTarget, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export const handleBufferRoutes = async ({ req, res, pathname, url, context, session }: RouteArgs) => {
  const queryMatch = pathname.match(/^\/api\/networks\/([^/]+)\/queries$/);
  if (queryMatch && req.method === 'POST') {
    const networkId = decodeURIComponent(queryMatch[1]);
    const target = String((await readJson(req)).target ?? '').trim();
    if (!target || target === 'server' || isChannelTarget(target)) {
      writeJson(res, 400, { message: 'Private-message target is required' });
      return true;
    }
    const query = context.runtime.openQuery(session!.user.id, networkId, target);
    context.runtime.send(session!.user.id, { type: 'query.open', query });
    writeJson(res, 200, { query });
    return true;
  }
  const singleQueryMatch = pathname.match(/^\/api\/networks\/([^/]+)\/queries\/([^/]+)$/);
  if (singleQueryMatch && req.method === 'DELETE') {
    const networkId = decodeURIComponent(singleQueryMatch[1]);
    const target = decodeURIComponent(singleQueryMatch[2]);
    context.runtime.closeQuery(session!.user.id, networkId, target);
    context.runtime.send(session!.user.id, { type: 'query.close', networkId, target });
    writeJson(res, 200, { ok: true });
    return true;
  }
  const readMatch = pathname.match(/^\/api\/channels\/([^/]+)\/read$/);
  if (readMatch && req.method === 'POST') {
    context.runtime.markChannelRead(session!.user.id, decodeURIComponent(readMatch[1]));
    writeJson(res, 200, { ok: true });
    return true;
  }
  const historyMatch = pathname.match(/^\/api\/networks\/([^/]+)\/history$/);
  if (historyMatch && req.method === 'GET') {
    const networkId = decodeURIComponent(historyMatch[1]);
    const target = String(url.searchParams.get('target') ?? 'server');
    const limit = Number(url.searchParams.get('limit') ?? 200);
    writeJson(res, 200, {
      messages: context.runtime.history(session!.user.id, networkId, target, Number.isFinite(limit) ? limit : 200),
    });
    return true;
  }
  return false;
};
