import type { NetworkProfile } from '../../shared/protocol-chat.js';
import { listWorkspaceNetworks } from '../../shared/network-model.js';
import type { NetworkRuntimeState } from './workspace-types.js';

type ConnectionStatus = NetworkRuntimeState['phase'];

export type ConnectionLabelParts = {
  name: string;
  nick: string;
};

export const getWorkspaceNetworks = (networks: NetworkProfile[]) =>
  listWorkspaceNetworks(networks);

export const getConnectionStatus = (runtime: NetworkRuntimeState | null): ConnectionStatus => {
  return runtime?.phase ?? 'offline';
};

export const getConnectionLabelParts = (
  _workspaceNetworks: NetworkProfile[],
  network: NetworkProfile,
  runtime: NetworkRuntimeState | null
) => {
  return {
    name: network.name,
    nick: runtime?.nick ?? network.nick,
  };
};

export const getConnectionLabel = (
  workspaceNetworks: NetworkProfile[],
  network: NetworkProfile,
  runtime: NetworkRuntimeState | null
) => {
  const parts = getConnectionLabelParts(workspaceNetworks, network, runtime);
  return `${parts.name} (${parts.nick})`;
};
