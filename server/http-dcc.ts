import { dccSendRequestSchema } from '../shared/dcc.js';
import { badRequest } from './app-error.js';
import { readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export async function handleDccRoutes({ req, res, pathname, context }: RouteArgs) {
  if (req.method !== 'POST' || !pathname.startsWith('/api/dcc/') || !context.dcc) return false;
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw badRequest('A JSON request is required.');
  }
  const dcc = context.dcc;
  if (pathname === '/api/dcc/send') {
    const request = dccSendRequestSchema.safeParse(await readJson(req, 4096));
    if (!request.success) throw badRequest('Invalid file transfer request.');
    await dcc.send(request.data);
  } else {
    const action = /^\/api\/dcc\/([a-f0-9-]{36})\/(accept|decline|cancel)$/.exec(pathname);
    if (!action) return false;
    const [, id, verb] = action;
    if (verb === 'accept') await dcc.accept(id);
    else if (verb === 'decline') dcc.decline(id);
    else dcc.cancel(id);
  }
  writeJson(res, 200, {});
  return true;
}
