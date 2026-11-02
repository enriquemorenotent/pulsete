import type net from 'node:net';

export type AccountMediaRoute = {
  location: string;
  signal: AbortSignal;
  connect(host: string, port: number): Promise<net.Socket>;
};
const routes = new Map<string, AccountMediaRoute>();

export function registerAccountMediaRoute(networkId: string, route: AccountMediaRoute) {
  routes.set(networkId, route);
  const remove = () => { if (routes.get(networkId) === route) routes.delete(networkId); };
  route.signal.addEventListener('abort', remove, { once: true });
  if (route.signal.aborted) remove();
}

export function getAccountMediaRoute(networkId: string, location: string) {
  const route = routes.get(networkId);
  if (!route || route.signal.aborted || route.location !== location) throw new Error('Connect this account’s VPN to load external content');
  return route;
}
