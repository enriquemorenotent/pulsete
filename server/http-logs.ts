import {
  normalizeHistorySearchLimit,
  normalizeHistorySearchQuery,
  normalizeOptionalSearchFilter,
} from './http-history-search.js';
import { writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export const handleLogRoutes = async ({ req, res, pathname, url, context }: RouteArgs) => {
  if (pathname !== '/api/logs/search' || req.method !== 'GET') {
    return false;
  }
  const query = normalizeHistorySearchQuery(url.searchParams.get('q'));
  const limit = normalizeHistorySearchLimit(url.searchParams.get('limit'));
  writeJson(res, 200, context.logs.search(query, limit, {
    networkId: normalizeOptionalSearchFilter(url.searchParams.get('networkId')),
    target: normalizeOptionalSearchFilter(url.searchParams.get('target')),
  }));
  return true;
};
