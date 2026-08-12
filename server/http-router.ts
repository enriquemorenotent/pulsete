import type { IncomingMessage, ServerResponse } from 'node:http';
import { toAppError } from './app-error.js';
import { handleAiAssistantRoutes } from './http-ai-assistant.js';
import { handleBackupRoutes } from './http-backups.js';
import { handleBufferRoutes } from './http-buffers.js';
import { handleFriendRoutes } from './http-friends.js';
import { handleLogRoutes } from './http-logs.js';
import { handleMutedNickRoutes } from './http-muted-nicks.js';
import { handleNickEmojiRoutes } from './http-nick-emojis.js';
import { handleNetworkRoutes } from './http-networks.js';
import { handlePreferenceRoutes } from './http-preferences.js';
import { handleDraftRoutes } from './http-drafts.js';
import { handleAvatarOverrideRoutes } from './http-avatar-overrides.js';
import { handlePagePreviewRoutes } from './http-page-previews.js';
import { isApi, isApiRequest, parseRequestUrl, writeJson } from './http-utils.js';
import type { HttpContext, HttpHandlerContext } from './http-types.js';
import {
  createPagePreviewResolver,
  type PagePreviewResolver,
} from './page-preview-resolver.js';
import { serveStatic } from './static-handler.js';
import {
  clientBootstrapPath,
  type ClientAuthentication,
} from './client-authentication.js';

export type HttpHandlerOptions = {
  assetRoot?: string;
  authentication?: ClientAuthentication;
  pagePreviewResolver?: PagePreviewResolver;
};

export const createHttpHandler = (
  context: HttpHandlerContext,
  options: HttpHandlerOptions = {}
) => {
  const pagePreviewResolver = options.pagePreviewResolver
    ?? createPagePreviewResolver();
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = parseRequestUrl(req.url);
      const pathname = url.pathname;
      if (options.authentication && pathname === clientBootstrapPath) {
        handleClientBootstrap(req, res, options.authentication);
        return;
      }
      if (
        options.authentication
        && (isApi(pathname) || pathname === '/ws')
        && !options.authentication.authenticate(req)
      ) {
        writeAuthenticationRequired(res);
        return;
      }
      const args = { req, res, url, pathname, context };
      if (
        (hasBackupApi(context) && await handleBackupRoutes({ ...args, context }))
        || await handleAiAssistantRoutes(args)
        || await handlePagePreviewRoutes(args, pagePreviewResolver)
        || await handlePreferenceRoutes(args)
        || await handleAvatarOverrideRoutes(args)
        || await handleDraftRoutes(args)
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
        await serveStatic(pathname, res, { assetRoot: options.assetRoot });
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
};

const hasBackupApi = (context: HttpHandlerContext): context is HttpContext =>
  'backups' in context;

const handleClientBootstrap = (
  req: IncomingMessage,
  res: ServerResponse,
  authentication: ClientAuthentication,
) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && authentication.authenticate(req)) {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST' || !authentication.bootstrap(req, res)) {
    writeAuthenticationRequired(res);
    return;
  }
  res.statusCode = 204;
  res.end();
};

const writeAuthenticationRequired = (res: ServerResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  writeJson(res, 401, { message: 'Client authentication required' });
};
