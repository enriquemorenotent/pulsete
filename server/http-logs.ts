import { badRequest } from './app-error.js';
import {
  normalizeHistorySearchLimit,
  normalizeHistorySearchQuery,
  normalizeOptionalSearchFilter,
} from './http-history-search.js';
import { writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import type { LogSourceKind } from '../shared/protocol-chat.js';

export const handleLogRoutes = async ({ req, res, pathname, url, context }: RouteArgs) => {
  if (pathname === '/api/logs/sources' && req.method === 'GET') {
    const q = normalizeOptionalSearchFilter(url.searchParams.get('q'));
    const networkId = normalizeOptionalSearchFilter(url.searchParams.get('networkId'));
    const kind = normalizeLogSourceKind(url.searchParams.get('kind'));
    const limit = normalizeHistorySearchLimit(url.searchParams.get('limit'));
    writeJson(res, 200, context.logs.listSources({
      ...(kind ? { kind } : {}),
      ...(networkId ? { networkId } : {}),
      ...(q ? { q } : {}),
    }, limit));
    return true;
  }

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

const normalizeLogSourceKind = (value: string | null): LogSourceKind | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === 'channel' || trimmed === 'query') {
    return trimmed;
  }
  throw badRequest('Invalid log source kind');
};
