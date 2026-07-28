import { pagePreviewRequestSchema } from '../shared/protocol-page-preview.js';
import { badRequest } from './app-error.js';
import { readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';
import type { PagePreviewResolver } from './page-preview-resolver.js';

export const handlePagePreviewRoutes = async (
  { req, res, pathname }: RouteArgs,
  resolver: PagePreviewResolver,
) => {
  if (pathname !== '/api/media/page-preview' || req.method !== 'POST') {
    return false;
  }
  const result = pagePreviewRequestSchema.safeParse(await readJson(req));
  if (!result.success) {
    throw badRequest('Invalid page preview payload');
  }
  writeJson(res, 200, await resolver.resolve(result.data.url));
  return true;
};
