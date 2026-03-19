import { writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export const handleStateRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (req.method === 'GET' && pathname === '/api/snapshot') {
    writeJson(res, 200, context.runtime.snapshot());
    return true;
  }
  return false;
};
