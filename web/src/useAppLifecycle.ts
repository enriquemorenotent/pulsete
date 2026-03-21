import { useEffect } from 'react';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { Action, State } from './app-types.js';
import { gatewayReconnectMessage } from './gateway.js';
import { useGatewayConnection } from './useGatewayConnection.js';
import { useAutoOpenNetworkManager, useManagedNetworkSelection } from './useNetworkManagerLifecycle.js';
import { useSelectedBufferEffects } from './useSelectedBufferEffects.js';
import { useStickyScroll } from './useStickyScroll.js';
import type { WorkspaceView } from './workspace.js';
import type { SocketHandle } from './client.js';

type MutableRef<T> = { current: T };

type LifecycleParams = {
  state: State;
  workspace: WorkspaceView;
  visibleNetworks: NetworkProfile[];
  managedNetworkId: string | null;
  dispatch: (action: Action) => void;
  setShowNetworkManager: (value: boolean) => void;
  setManagedNetworkId: (value: string | null) => void;
  socketRef: MutableRef<SocketHandle | null>;
  scrollRef: MutableRef<HTMLDivElement | null>;
  didAutoOpenManagerRef: MutableRef<boolean>;
};

export function useAppLifecycle(params: LifecycleParams) {
  useAutoOpenNetworkManager({
    phase: params.state.phase,
    connectionInstanceCount: params.workspace.connectionInstances.length,
    didAutoOpenManagerRef: params.didAutoOpenManagerRef,
    setShowNetworkManager: params.setShowNetworkManager,
  });

  useEffect(() => {
    if (!params.state.banner || params.state.banner.message === gatewayReconnectMessage) {
      return;
    }
    const timer = window.setTimeout(() => params.dispatch({ type: 'set-banner', banner: null }), 4200);
    return () => window.clearTimeout(timer);
  }, [params.dispatch, params.state.banner]);

  useGatewayConnection({
    dispatch: params.dispatch,
    socketRef: params.socketRef,
  });

  useSelectedBufferEffects({
    dispatch: params.dispatch,
    gatewayStatus: params.state.gatewayStatus,
    selectedBuffer: params.workspace.selectedBuffer,
  });

  useStickyScroll({
    scrollRef: params.scrollRef,
    messageCount: params.state.messages.length,
    selectedBufferId: params.workspace.selectedBuffer?.id,
  });

  useManagedNetworkSelection({
    phase: params.state.phase,
    networks: params.state.networks,
    visibleNetworks: params.visibleNetworks,
    managedNetworkId: params.managedNetworkId,
    setManagedNetworkId: params.setManagedNetworkId,
  });
}
