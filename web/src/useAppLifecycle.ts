import { useEffect } from 'react';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { Action, AppDomainState, AppTransientState, Banner, GatewayStatus } from './app-types.js';
import { gatewayReconnectMessage } from './gateway.js';
import { useGatewayConnection } from './useGatewayConnection.js';
import { useAutoOpenNetworkManager, useManagedNetworkSelection } from './useNetworkManagerLifecycle.js';
import { useSelectedBufferEffects } from './useSelectedBufferEffects.js';
import { useStickyScroll } from './useStickyScroll.js';
import type { WorkspaceView } from './workspace.js';
import type { SocketHandle } from './client.js';

type MutableRef<T> = { current: T };

type LifecycleParams = {
  banner: Banner;
  gatewayStatus: GatewayStatus;
  networks: AppDomainState['networks'];
  phase: AppDomainState['phase'];
  networkManager: AppTransientState['networkManager'];
  workspace: WorkspaceView;
  visibleNetworks: NetworkProfile[];
  dispatch: (action: Action) => void;
  socketRef: MutableRef<SocketHandle | null>;
  scrollRef: MutableRef<HTMLDivElement | null>;
  didAutoOpenManagerRef: MutableRef<boolean>;
};

export function useAppLifecycle(params: LifecycleParams) {
  useAutoOpenNetworkManager({
    phase: params.phase,
    networkManagerMode: params.networkManager.mode,
    connectionInstanceCount: params.workspace.connectionInstances.length,
    didAutoOpenManagerRef: params.didAutoOpenManagerRef,
    dispatch: params.dispatch,
  });

  useEffect(() => {
    if (!params.banner || params.banner.message === gatewayReconnectMessage) {
      return;
    }
    const timer = window.setTimeout(() => params.dispatch({ type: 'set-banner', banner: null }), 4200);
    return () => window.clearTimeout(timer);
  }, [params.banner, params.dispatch]);

  useGatewayConnection({
    dispatch: params.dispatch,
    socketRef: params.socketRef,
  });

  useSelectedBufferEffects({
    dispatch: params.dispatch,
    gatewayStatus: params.gatewayStatus,
    selectedBuffer: params.workspace.selectedBuffer,
  });

  useStickyScroll({
    scrollRef: params.scrollRef,
    selectedBufferId: params.workspace.selectedBuffer?.id,
  });

  useManagedNetworkSelection({
    phase: params.phase,
    networks: params.networks,
    visibleNetworks: params.visibleNetworks,
    managedNetworkId: params.networkManager.managedNetworkId,
    dispatch: params.dispatch,
  });
}
