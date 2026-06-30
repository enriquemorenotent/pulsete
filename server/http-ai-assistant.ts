import { badRequest } from './app-error.js';
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
    writeJson(res, 200, context.assistant.status());
    return true;
  }

  const askMatch = pathname.match(/^\/api\/buffers\/([^/]+)\/assistant$/);
  if (askMatch && req.method === 'POST') {
    const bufferId = decodeRouteParam(askMatch[1]);
    const request = readAiAssistantRequest(await readJson(req));
    writeJson(res, 200, await context.assistant.ask(bufferId, request));
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
