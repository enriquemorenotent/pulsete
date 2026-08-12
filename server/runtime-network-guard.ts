import { notFound } from './app-error.js';
import type { RuntimeNetworkStore } from './runtime-store.js';

type StoredNetworkLookup = Pick<RuntimeNetworkStore, 'get'>;
type RuntimeNetworkLookup = Pick<RuntimeNetworkStore, 'getRuntime'>;

export const requireStoredNetwork = (networks: StoredNetworkLookup, networkId: string) => {
  const network = networks.get(networkId);
  if (!network) {
    throw notFound('Network not found');
  }
  return network;
};

export const requireRuntimeNetwork = (networks: RuntimeNetworkLookup, networkId: string) => {
  const network = networks.getRuntime(networkId);
  if (!network) {
    throw notFound('Network not found');
  }
  return network;
};
