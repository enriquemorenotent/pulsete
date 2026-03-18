import type { NetworkProfile } from '../../shared/protocol.js';
import type { NetworkRuntimeState } from './workspace-types.js';

type ConnectionStatus = 'offline' | 'connecting' | 'connected';

export const getConnectionInstances = (networks: NetworkProfile[]) =>
  networks.filter((network) => network.managerHidden);

export const getConnectionStatus = (runtime: NetworkRuntimeState | null): ConnectionStatus => {
  if (runtime?.connected) {
    return 'connected';
  }
  if (runtime?.connecting) {
    return 'connecting';
  }
  return 'offline';
};

export const canShowInstanceChildren = (runtime: NetworkRuntimeState | null) =>
  getConnectionStatus(runtime) === 'connected';

export const getConnectionLabel = (instances: NetworkProfile[], network: NetworkProfile) => {
  const rootId = network.templateId ?? network.id;
  const peers = instances.filter((item) => (item.templateId ?? item.id) === rootId);
  return peers.length <= 1 ? network.name : `${network.name} (${peers.findIndex((item) => item.id === network.id) + 1})`;
};
