import { clearSessionCookie, parseCookies, readJson, setSessionCookie, writeJson, cookieName } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import { sessionResponse } from './session-utils.js';

export const handleAuthRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (req.method === 'GET' && pathname === '/api/session') {
    writeJson(res, 200, sessionResponse(context.storage, context.storage.getSession(parseCookies(req.headers.cookie)[cookieName] ?? '')));
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/bootstrap') {
    const body = await readJson(req);
    if (context.storage.hasUsers()) {
      writeJson(res, 409, { message: 'Bootstrap already completed' });
      return true;
    }
    return writeAuthSession(res, context, context.storage.bootstrapUser(String(body.username ?? '').trim(), String(body.password ?? '')));
  }
  if (req.method === 'POST' && pathname === '/api/register') {
    const body = await readJson(req);
    if (!context.storage.hasUsers()) {
      writeJson(res, 409, { message: 'Use bootstrap for the first account' });
      return true;
    }
    return writeAuthSession(res, context, context.storage.createUser(String(body.username ?? '').trim(), String(body.password ?? '')));
  }
  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readJson(req);
    const user = context.storage.authenticate(String(body.username ?? '').trim(), String(body.password ?? ''));
    if (!user) {
      writeJson(res, 401, { message: 'Invalid credentials' });
      return true;
    }
    return writeAuthSession(res, context, user);
  }
  if (req.method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req.headers.cookie)[cookieName];
    if (token) {
      context.storage.deleteSession(token);
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
