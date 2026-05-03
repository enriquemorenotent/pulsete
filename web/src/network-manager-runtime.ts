import { emptyNetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';
import type { NetworkProfile } from '../../shared/protocol-chat.js';
import type { NetworkRuntimeState } from './workspace.js';

export function buildManagedRuntime(
  managedNetwork: NetworkProfile | null,
  networkStates: Record<string, NetworkRuntimeState>
) {
  if (!managedNetwork) {
    return null;
  }
  if (!managedNetwork.workspaceOpen) {
    return null;
  }
  return networkStates[managedNetwork.id] ?? {
    phase: 'offline',
    serverName: null,
    nick: managedNetwork.nick,
    capabilities: emptyNetworkRuntimeCapabilities(),
  };
}

export const buildManagedRuntimeMap = (
  managedNetworks: readonly NetworkProfile[],
  networkStates: Record<string, NetworkRuntimeState>,
) =>
  managedNetworks.reduce<Record<string, NetworkRuntimeState | null>>((runtimes, network) => {
    runtimes[network.id] = buildManagedRuntime(network, networkStates);
    return runtimes;
  }, {});
