import { getNetworkRootId } from '../../shared/network-model.js';
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
  const instances = connectionInstances.filter((network) => getNetworkRootId(network) === managedNetwork.id);
  if (instances.some((network) => networkStates[network.id]?.phase === 'connected')) {
    return { phase: 'connected' as const, serverName: null, nick: managedNetwork.nick };
  }
  if (instances.some((network) => networkStates[network.id]?.phase === 'connecting')) {
    return { phase: 'connecting' as const, serverName: null, nick: managedNetwork.nick };
  }
  return instances.length > 0 ? { phase: 'offline' as const, serverName: null, nick: managedNetwork.nick } : null;
}
