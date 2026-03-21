import { useEffect } from 'react';
import { isSavedNetwork } from '../../shared/network-model.js';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { AppDomainState } from './app-types.js';
import { resolveManagedNetworkId } from './network-manager-state.js';

type MutableRef<T> = { current: T };

type UseAutoOpenNetworkManagerParams = {
  phase: AppDomainState['phase'];
  connectionInstanceCount: number;
  didAutoOpenManagerRef: MutableRef<boolean>;
  setShowNetworkManager: (value: boolean) => void;
};

type UseManagedNetworkSelectionParams = {
  phase: AppDomainState['phase'];
  networks: NetworkProfile[];
  visibleNetworks: NetworkProfile[];
  managedNetworkId: string | null;
  setManagedNetworkId: (value: string | null) => void;
};

export function useAutoOpenNetworkManager(params: UseAutoOpenNetworkManagerParams) {
  useEffect(() => {
    if (params.phase !== 'ready') {
      params.didAutoOpenManagerRef.current = false;
      params.setShowNetworkManager(false);
      return;
    }
    if (params.didAutoOpenManagerRef.current) {
      return;
    }
    params.didAutoOpenManagerRef.current = true;
    params.setShowNetworkManager(params.connectionInstanceCount === 0);
  }, [params.connectionInstanceCount, params.phase, params.setShowNetworkManager, params.didAutoOpenManagerRef]);
}

export function useManagedNetworkSelection(params: UseManagedNetworkSelectionParams) {
  useEffect(() => {
    const nextManagedNetworkId = resolveManagedNetworkId({
      phase: params.phase,
      managerNetworks: params.networks.filter(isSavedNetwork),
      visibleNetworks: params.visibleNetworks,
      managedNetworkId: params.managedNetworkId,
    });
    if (nextManagedNetworkId !== params.managedNetworkId) {
      params.setManagedNetworkId(nextManagedNetworkId);
    }
  }, [params.managedNetworkId, params.networks, params.phase, params.setManagedNetworkId, params.visibleNetworks]);
}
