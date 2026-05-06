import { writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export const handleDebugRoutes = async ({
  res,
  pathname,
  context,
}: RouteArgs) => {
  if (pathname !== '/api/debug/memory') {
    return false;
  }
  writeJson(res, 200, context.debug.memory());
  return true;
};
