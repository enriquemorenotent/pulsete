import { createHash } from 'node:crypto';
import { toAppError, badRequest } from './app-error.js';
import { aiAssistantRequestSchema } from '../shared/protocol-ai.js';
import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export const handleAiAssistantRoutes = async ({
  req,
  res,
  pathname,
  context,
}: RouteArgs) => {
  if (pathname === '/api/assistant/status' && req.method === 'GET') {
    writeJson(res, 200, await context.assistant.status());
    return true;
  }

  if (pathname === '/api/assistant/login' && req.method === 'POST') {
    writeJson(res, 200, await context.assistant.startLogin());
    return true;
  }

  const askMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/assistant$/);
  const sessionId = createHash('sha256').update((req.headers.cookie ?? '').split(';').map((part) => part.trim()).find((part) => part.startsWith('pulsete-session=')) ?? 'local').digest('hex');
  if (askMatch && req.method === 'DELETE') {
    const request = readAiAssistantRequest(await readJson(req));
    if (!request.continuationToken) throw badRequest('Continuation token is required');
    context.assistant.clear?.(decodeRouteParam(askMatch[1]), request.continuationToken, sessionId);
    writeJson(res, 200, {});
    return true;
  }
  if (askMatch && req.method === 'POST') {
    const bufferId = decodeRouteParam(askMatch[1]);
    const request = readAiAssistantRequest(await readJson(req));
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', cancel);
    const streaming = req.headers.accept?.includes('application/x-ndjson') === true;
    const send = (event: unknown) => { if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
    if (streaming) { res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }); res.flushHeaders(); }
    try {
      const response = await context.assistant.ask(bufferId, request, controller.signal, {
        sessionId, onProgress: streaming ? (stage) => send({ type: 'progress', stage }) : undefined,
      });
      if (!res.destroyed) {
        if (streaming) { send({ type: 'result', response }); res.end(); }
        else writeJson(res, 200, response);
      }
    } catch (error) {
      if (!streaming) throw error;
      send({ type: 'error', message: toAppError(error).message });
      res.end();
    } finally {
      res.off('close', cancel);
    }
    return true;
  }

  return false;
};

const readAiAssistantRequest = (body: unknown) => {
  const result = aiAssistantRequestSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid assistant payload');
  }
  return result.data;
};
