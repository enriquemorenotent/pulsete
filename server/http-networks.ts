import { readJson, writeJson } from './http-utils.js';
import type { NetworkInput } from './storage.js';
import type { RouteArgs } from './http-types.js';

export const handleNetworkRoutes = async ({ req, res, pathname, context, session }: RouteArgs) => {
  if (req.method === 'GET' && pathname === '/api/networks') {
    writeJson(res, 200, { networks: context.storage.listNetworks(session!.user.id) });
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/networks') {
    const network = context.runtime.saveNetwork(session!.user.id, normalizeNetworkInput(await readJson(req)));
    writeJson(res, 200, { network });
    return true;
  }
  const networkMatch = pathname.match(/^\/api\/networks\/([^/]+)$/);
  if (networkMatch && req.method === 'PUT') {
    const networkId = decodeURIComponent(networkMatch[1]);
    const network = context.runtime.saveNetwork(session!.user.id, normalizeNetworkInput(await readJson(req), networkId));
    writeJson(res, 200, { network });
    return true;
  }
  if (networkMatch && req.method === 'DELETE') {
    context.runtime.deleteNetwork(session!.user.id, decodeURIComponent(networkMatch[1]));
    writeJson(res, 200, { ok: true });
    return true;
  }
  const connectMatch = pathname.match(/^\/api\/networks\/([^/]+)\/(connect|disconnect)$/);
  if (connectMatch) {
    const networkId = decodeURIComponent(connectMatch[1]);
    connectMatch[2] === 'connect'
      ? context.runtime.connect(session!.user.id, networkId)
      : context.runtime.disconnect(session!.user.id, networkId);
    writeJson(res, 200, { ok: true });
    return true;
  }
  return false;
};

const normalizeNetworkInput = (body: any, id?: string): NetworkInput => ({
  id,
  ...body,
  templateId: typeof body.templateId === 'string' ? body.templateId : null,
  managerHidden: Boolean(body.managerHidden),
  port: Number(body.port ?? 6667),
  tls: Boolean(body.tls),
  altNicks: Array.isArray(body.altNicks) ? body.altNicks : [],
  realName: String(body.realName ?? ''),
  favorite: Boolean(body.favorite),
  autoJoin: Array.isArray(body.autoJoin) ? body.autoJoin : [],
});
