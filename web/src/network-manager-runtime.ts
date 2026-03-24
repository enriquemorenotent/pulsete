import { listConnectionPeers } from '../../shared/network-model.js';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { NetworkRuntimeState } from './workspace.js';

export function buildManagedRuntime(
  managedNetwork: NetworkProfile | null,
  connectionInstances: NetworkProfile[],
  networkStates: Record<string, NetworkRuntimeState>
) {
  if (!managedNetwork) {
    return null;
  }
  const instances = listConnectionPeers(connectionInstances, managedNetwork.id);
  if (instances.some((network) => networkStates[network.id]?.phase === 'connected')) {
    return { phase: 'connected' as const, serverName: null, nick: managedNetwork.nick };
  }
  if (instances.some((network) => networkStates[network.id]?.phase === 'connecting')) {
    return { phase: 'connecting' as const, serverName: null, nick: managedNetwork.nick };
  }
  return instances.length > 0 ? { phase: 'offline' as const, serverName: null, nick: managedNetwork.nick } : null;
}

export const buildManagedRuntimeMap = (
  managedNetworks: readonly NetworkProfile[],
  connectionInstances: NetworkProfile[],
  networkStates: Record<string, NetworkRuntimeState>,
) =>
  managedNetworks.reduce<Record<string, NetworkRuntimeState | null>>((runtimes, network) => {
    runtimes[network.id] = buildManagedRuntime(network, connectionInstances, networkStates);
    return runtimes;
  }, {});
