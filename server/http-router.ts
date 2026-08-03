import type { IncomingMessage, ServerResponse } from 'node:http';
import { forbidden, toAppError, unauthorized } from './app-error.js';
import { launchBootstrapPath } from '../shared/launch-authentication.js';
import { handleAiAssistantRoutes } from './http-ai-assistant.js';
import { handleBackupRoutes } from './http-backups.js';
import { handleBufferRoutes } from './http-buffers.js';
import { handleFriendRoutes } from './http-friends.js';
import { handleLogRoutes } from './http-logs.js';
import { handleLaunchAuthenticationBootstrap } from './http-launch-authentication.js';
import { handleMutedNickRoutes } from './http-muted-nicks.js';
import { handleNickEmojiRoutes } from './http-nick-emojis.js';
import { handleNetworkRoutes } from './http-networks.js';
import { handlePreferenceRoutes } from './http-preferences.js';
import { handleDraftRoutes } from './http-drafts.js';
import { handleAvatarOverrideRoutes } from './http-avatar-overrides.js';
import { handlePagePreviewRoutes } from './http-page-previews.js';
import { isApi, isApiRequest, parseRequestUrl, writeJson } from './http-utils.js';
import type { HttpContext, HttpHandlerContext } from './http-types.js';
import type { LaunchAuthentication } from './launch-authentication.js';
import {
  createRequestOriginPolicy,
  type RequestOriginPolicy,
} from './request-origin-policy.js';
import {
  createPagePreviewResolver,
  type PagePreviewResolver,
} from './page-preview-resolver.js';
import { serveStatic } from './static-handler.js';

export type HttpHandlerOptions = {
  authentication?: LaunchAuthentication;
  assetRoot?: string;
  originPolicy?: RequestOriginPolicy;
  pagePreviewResolver?: PagePreviewResolver;
};

export const createHttpHandler = (
  context: HttpHandlerContext,
  options: HttpHandlerOptions = {}
) => {
  const pagePreviewResolver = options.pagePreviewResolver
    ?? createPagePreviewResolver();
  const originPolicy = options.originPolicy ?? createRequestOriginPolicy();
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = parseRequestUrl(req.url);
      const pathname = url.pathname;
      if (isApi(pathname) && !originPolicy.allows(req.headers.origin)) {
        throw forbidden('Origin not allowed');
      }
      if (pathname === launchBootstrapPath) {
        if (!options.authentication) {
          writeJson(res, 404, { message: 'Not found' });
          return;
        }
        await handleLaunchAuthenticationBootstrap(
          req,
          res,
          options.authentication,
          originPolicy,
        );
        return;
      }
      if (
        isApi(pathname)
        && options.authentication
        && !options.authentication.authenticate(req)
      ) {
        throw unauthorized('Authentication required');
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
      if (isApiRequest(req.url) || isLaunchBootstrapRequest(req.url)) {
        writeJson(res, appError.status, { message: appError.message });
        return;
      }
      res.statusCode = appError.status;
      res.end(appError.message);
    }
  };
};

const isLaunchBootstrapRequest = (value: string | undefined) => {
  try {
    return new URL(value ?? '/', 'http://127.0.0.1').pathname === launchBootstrapPath;
  } catch {
    return false;
  }
};

const hasBackupApi = (context: HttpHandlerContext): context is HttpContext =>
  'backups' in context;
