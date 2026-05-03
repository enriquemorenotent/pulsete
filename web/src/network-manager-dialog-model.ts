import { resolveNetworkAuthMethod } from '../../shared/network-model.js';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol-chat.js';

export type NetworkManagerRowStatus = 'online' | 'connecting' | null;

export const getNetworkManagerRowStatus = (runtime: NetworkRuntimeState | null): NetworkManagerRowStatus =>
  runtime?.phase === 'connected' ? 'online' : runtime?.phase === 'connecting' ? 'connecting' : null;

export const getNetworkManagerConnectButtonState = (
  selected: NetworkProfile | null,
  runtime: NetworkRuntimeState | null,
) => ({
  label:
    runtime?.phase === 'connected'
      ? 'Connected'
      : runtime?.phase === 'connecting'
      ? 'Connecting'
        : 'Connect',
  disabled: !selected || runtime?.phase === 'connected' || runtime?.phase === 'connecting',
});

export const getNetworkManagerStatusLabel = (runtime: NetworkRuntimeState | null) =>
  runtime?.phase === 'connected' ? 'Online' : runtime?.phase === 'connecting' ? 'Connecting' : 'Offline';

export const getNetworkManagerAuthLabel = (network: NetworkProfile) => {
  switch (resolveNetworkAuthMethod(network)) {
    case 'server-pass':
      return 'Server PASS';
    case 'sasl-plain':
      return 'SASL PLAIN';
    case 'nickserv':
      return 'NickServ';
    default:
      return 'No auth';
  }
};

export const getNetworkManagerAutoJoinLabel = (network: NetworkProfile) => {
  if (network.autoJoin.length === 0) {
    return 'Manual';
  }
  if (network.autoJoin.length === 1) {
    return network.autoJoin[0]!;
  }
  return `${network.autoJoin.length} channels`;
};
