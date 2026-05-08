import type { IncomingMessage, ServerResponse } from 'node:http';
import { toAppError } from './app-error.js';
import { handleBackupRoutes } from './http-backups.js';
import { handleBufferRoutes } from './http-buffers.js';
import { handleFriendRoutes } from './http-friends.js';
import { handleLogRoutes } from './http-logs.js';
import { handleMutedNickRoutes } from './http-muted-nicks.js';
import { handleNickEmojiRoutes } from './http-nick-emojis.js';
import { handleNetworkRoutes } from './http-networks.js';
import { isApi, isApiRequest, parseRequestUrl, writeJson } from './http-utils.js';
import type { HttpContext, HttpHandlerContext } from './http-types.js';
import { serveStatic } from './static-handler.js';

export const createHttpHandler = (context: HttpHandlerContext) => async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = parseRequestUrl(req.url);
    const pathname = url.pathname;
    const args = { req, res, url, pathname, context };
    if (
      (hasBackupApi(context) && await handleBackupRoutes({ ...args, context }))
      || await handleNetworkRoutes(args)
      || await handleNickEmojiRoutes(args)
      || await handleFriendRoutes(args)
      || await handleMutedNickRoutes(args)
      || await handleLogRoutes(args)
      || await handleBufferRoutes(args)
    ) {
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

const hasBackupApi = (context: HttpHandlerContext): context is HttpContext => 'backups' in context;
