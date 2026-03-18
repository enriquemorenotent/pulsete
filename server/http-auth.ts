import { z } from 'zod';
import { badRequest } from './app-error.js';
import { clearSessionCookie, readJson, setSessionCookie, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import { getSessionTokenFromRequest, sessionResponse } from './session-utils.js';

const credentialsSchema = z.object({
  username: z.string().refine((value) => value.trim().length > 0, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const handleAuthRoutes = async ({ req, res, pathname, context, session }: RouteArgs) => {
  if (req.method === 'GET' && pathname === '/api/session') {
    writeJson(res, 200, sessionResponse(context.storage, session));
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/bootstrap') {
    const body = await readCredentials(req);
    if (context.storage.hasUsers()) {
      writeJson(res, 409, { message: 'Bootstrap already completed' });
      return true;
    }
    return writeAuthSession(res, context, context.storage.bootstrapUser(body.username, body.password));
  }
  if (req.method === 'POST' && pathname === '/api/register') {
    const body = await readCredentials(req);
    if (!context.storage.hasUsers()) {
      writeJson(res, 409, { message: 'Use bootstrap for the first account' });
      return true;
    }
    return writeAuthSession(res, context, context.storage.createUser(body.username, body.password));
  }
  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readCredentials(req);
    const user = context.storage.authenticate(body.username, body.password);
    if (!user) {
      writeJson(res, 401, { message: 'Invalid credentials' });
      return true;
    }
    return writeAuthSession(res, context, user);
  }
  if (req.method === 'POST' && pathname === '/api/logout') {
    const token = getSessionTokenFromRequest(req);
    if (token) {
      context.storage.deleteSession(token);
      context.runtime.revokeSession(token, session?.user.id);
    }
    writeJson(res, 200, { ok: true }, clearSessionCookie());
    return true;
  }
  return false;
};

const writeAuthSession = (
  res: RouteArgs['res'],
  context: RouteArgs['context'],
  user: { id: string; username: string }
) => {
  const session = context.storage.createSession(user.id);
  writeJson(res, 200, sessionResponse(context.storage, context.storage.getSession(session.token)), setSessionCookie(session.token));
  return true;
};

const readCredentials = async (req: RouteArgs['req']) => {
  const result = credentialsSchema.safeParse(await readJson(req));
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'Invalid authentication payload');
  }
  return result.data;
};
