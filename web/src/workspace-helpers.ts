import type { NetworkProfile } from '../../shared/protocol.js';
import type { NetworkRuntimeState } from './workspace-types.js';

type ConnectionStatus = NetworkRuntimeState['phase'];
type ConnectionPeers = ReturnType<typeof getConnectionPeers>;

export type ConnectionLabelParts = {
  name: string;
  nick: string;
  instanceIndex: number | null;
};

export const getConnectionInstances = (networks: NetworkProfile[]) =>
  networks.filter((network) => network.managerHidden);

export const getConnectionStatus = (runtime: NetworkRuntimeState | null): ConnectionStatus => {
  return runtime?.phase ?? 'offline';
};

const getConnectionPeers = (
  instances: NetworkProfile[],
  network: NetworkProfile
) => {
  const rootId = network.templateId ?? network.id;
  return instances.filter((item) => (item.templateId ?? item.id) === rootId);
};

const getConnectionInstanceIndex = (peers: ConnectionPeers, networkId: string) =>
  peers.length <= 1 ? null : peers.findIndex((item) => item.id === networkId) + 1;

export const getConnectionLabelParts = (
  instances: NetworkProfile[],
  network: NetworkProfile,
  runtime: NetworkRuntimeState | null
) => {
  const peers = getConnectionPeers(instances, network);
  return {
    name: network.name,
    nick: runtime?.nick ?? network.nick,
    instanceIndex: getConnectionInstanceIndex(peers, network.id),
  };
};

export const getConnectionLabel = (
  instances: NetworkProfile[],
  network: NetworkProfile,
  runtime: NetworkRuntimeState | null
) => {
  const parts = getConnectionLabelParts(instances, network, runtime);
  const indexSuffix = parts.instanceIndex === null ? '' : `, ${parts.instanceIndex}`;
  return `${parts.name} (${parts.nick}${indexSuffix})`;
};
