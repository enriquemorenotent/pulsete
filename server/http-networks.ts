import { decodeRouteParam, readJson, writeJson } from './http-utils.js';
import type { RouteArgs } from './http-types.js';

export const handleNetworkRoutes = async ({ req, res, pathname, context }: RouteArgs) => {
  if (req.method === 'GET' && pathname === '/api/networks') {
    writeJson(res, 200, { networks: context.storage.listNetworks() });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/networks') {
    const result = context.runtime.saveNetworkResult(removeRequestNetworkId(await readJson(req)));
    writeJson(res, 200, result);
    return true;
  }
  const networkMatch = pathname.match(/^\/api\/networks\/([^/]+)$/);
  if (networkMatch && req.method === 'PUT') {
    const networkId = decodeRouteParam(networkMatch[1]);
    const result = context.runtime.saveNetworkResult(await readJson(req), networkId);
    writeJson(res, 200, result);
    return true;
  }
  if (networkMatch && req.method === 'DELETE') {
    const result = context.runtime.deleteNetworkResult(decodeRouteParam(networkMatch[1]));
    writeJson(res, 200, { ok: true, ...result });
    return true;
  }
  const duplicateMatch = pathname.match(/^\/api\/networks\/([^/]+)\/duplicate$/);
  if (duplicateMatch && req.method === 'POST') {
    const result = context.runtime.duplicateNetworkResult(decodeRouteParam(duplicateMatch[1]));
    writeJson(res, 200, result);
    return true;
  }
  const connectMatch = pathname.match(/^\/api\/networks\/([^/]+)\/(connect|disconnect)$/);
  if (connectMatch && req.method === 'POST') {
    const networkId = decodeRouteParam(connectMatch[1]);
    connectMatch[2] === 'connect'
      ? context.runtime.connect(networkId)
      : context.runtime.disconnect(networkId);
    writeJson(res, 200, { ok: true });
    return true;
  }
  return false;
};

const removeRequestNetworkId = (body: unknown) => {
  if (!body || typeof body !== 'object' || !('id' in body)) {
    return body;
  }
  const { id: _ignored, ...rest } = body;
  return rest;
};
