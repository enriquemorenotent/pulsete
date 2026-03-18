import type { IncomingMessage, ServerResponse } from 'node:http';
import { toAppError } from './app-error.js';
import { handleAuthRoutes } from './http-auth.js';
import { handleBufferRoutes } from './http-buffers.js';
import { handleNetworkRoutes } from './http-networks.js';
import { isApi, isApiRequest, parseRequestUrl, writeJson } from './http-utils.js';
import type { HttpContext } from './http-types.js';
import { getSessionFromRequest } from './session-utils.js';
import { serveStatic } from './static-handler.js';

export const createHttpHandler = (context: HttpContext) => async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = parseRequestUrl(req.url);
    const pathname = url.pathname;
    const session = getSessionFromRequest(context.storage, req);
    const args = { req, res, url, pathname, context, session };
    if (await handleAuthRoutes(args)) {
      return;
    }
    if (isApi(pathname) && !session) {
      writeJson(res, 401, { message: 'Authentication required' });
      return;
    }
    if (await handleNetworkRoutes(args) || await handleBufferRoutes(args)) {
      return;
    }
    if (pathname === '/ws') {
      res.statusCode = 426;
      res.end('WebSocket upgrade required');
      return;
    }
    if (!isApi(pathname)) {
      await serveStatic(pathname, res);
      return;
    }
    writeJson(res, 404, { message: 'Not found' });
  } catch (error) {
    const appError = toAppError(error);
    if (isApiRequest(req.url)) {
      writeJson(res, appError.status, { message: appError.message });
      return;
    }
    res.statusCode = appError.status;
    res.end(appError.message);
  }
};
