import type { IncomingMessage, ServerResponse } from 'node:http';
import { forbidden, unauthorized } from './app-error.js';
import { readJson, writeJson } from './http-utils.js';
import type { LaunchAuthentication } from './launch-authentication.js';
import type { RequestOriginPolicy } from './request-origin-policy.js';

export const handleLaunchAuthenticationBootstrap = async (
  req: IncomingMessage,
  res: ServerResponse,
  authentication: LaunchAuthentication,
  originPolicy: RequestOriginPolicy,
) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method not allowed');
    return;
  }
  if (!req.headers.origin || !originPolicy.allows(req.headers.origin)) {
    throw forbidden('Origin not allowed');
  }
  res.setHeader('Cache-Control', 'no-store');
  const body = await readJson(req) as { token?: unknown };
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!authentication.consumeBootstrapToken(token)) {
    throw unauthorized('Authentication required');
  }
  writeJson(res, 200, { ok: true }, authentication.createSetCookieHeader());
};
