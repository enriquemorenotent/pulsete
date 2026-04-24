import { useEffect } from 'react';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { Action, AppDomainState, NetworkManagerState } from './app-types.js';
import { resolveManagedNetworkId } from './network-manager-state.js';

type MutableRef<T> = { current: T };

type UseAutoOpenNetworkManagerParams = {
  phase: AppDomainState['phase'];
  networkManagerMode: NetworkManagerState['mode'];
  workspaceNetworkCount: number;
  didAutoOpenManagerRef: MutableRef<boolean>;
  dispatch: (action: Action) => void;
};

type UseManagedNetworkSelectionParams = {
  phase: AppDomainState['phase'];
  networks: NetworkProfile[];
  visibleNetworks: NetworkProfile[];
  managedNetworkId: string | null;
  dispatch: (action: Action) => void;
};

export function useAutoOpenNetworkManager(params: UseAutoOpenNetworkManagerParams) {
  useEffect(() => {
    if (params.phase !== 'ready') {
      params.didAutoOpenManagerRef.current = false;
      if (params.networkManagerMode !== 'closed') {
        params.dispatch({ type: 'close-network-manager' });
      }
      return;
    }
    if (params.didAutoOpenManagerRef.current) {
      return;
    }
    params.didAutoOpenManagerRef.current = true;
    if (params.workspaceNetworkCount === 0) {
      params.dispatch({ type: 'open-network-manager' });
    }
  }, [
    params.dispatch,
    params.didAutoOpenManagerRef,
    params.networkManagerMode,
    params.phase,
    params.workspaceNetworkCount,
  ]);
}

export function useManagedNetworkSelection(params: UseManagedNetworkSelectionParams) {
  useEffect(() => {
    const nextManagedNetworkId = resolveManagedNetworkId({
      phase: params.phase,
      managerNetworks: params.networks,
      visibleNetworks: params.visibleNetworks,
      managedNetworkId: params.managedNetworkId,
    });
    if (nextManagedNetworkId !== params.managedNetworkId) {
      params.dispatch({ type: 'set-managed-network', networkId: nextManagedNetworkId });
    }
  }, [params.dispatch, params.managedNetworkId, params.networks, params.phase, params.visibleNetworks]);
}
