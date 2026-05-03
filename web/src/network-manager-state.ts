import type { NetworkProfile } from '../../shared/protocol-chat.js';
import type { AppDomainState } from './app-types.js';

type ResolveManagedNetworkIdArgs = {
  phase: AppDomainState['phase'];
  managerNetworks: NetworkProfile[];
  visibleNetworks: NetworkProfile[];
  managedNetworkId: string | null;
};

export const resolveManagedNetworkId = ({
  phase,
  managerNetworks,
  visibleNetworks,
  managedNetworkId,
}: ResolveManagedNetworkIdArgs) => {
  if (phase !== 'ready' || managerNetworks.length === 0) {
    return null;
  }
  if (managedNetworkId && managerNetworks.some((network) => network.id === managedNetworkId)) {
    return managedNetworkId;
  }
  return visibleNetworks[0]?.id ?? managerNetworks[0]?.id ?? null;
};
