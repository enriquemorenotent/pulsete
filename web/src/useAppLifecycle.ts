import { useEffect, useState } from 'react';
import type { NetworkProfile, ServerMessage } from '../../shared/protocol.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { Action, AppDomainState, AppTransientState, Banner, GatewayStatus } from './app-types.js';
import { gatewayReconnectMessage } from './gateway.js';
import { useGatewayConnection } from './useGatewayConnection.js';
import { useAutoOpenNetworkManager, useManagedNetworkSelection } from './useNetworkManagerLifecycle.js';
import { useSelectedBufferEffects } from './useSelectedBufferEffects.js';
import { useStickyScroll } from './useStickyScroll.js';
import type { WorkspaceView } from './workspace.js';
import type { SocketHandle } from './client.js';
import type { ChatPaneProps } from './ChatPane.js';

type MutableRef<T> = { current: T };

type LifecycleParams = {
  applyServerMessages: ApplyServerMessages;
  applySocketMessage: (message: ServerMessage) => void;
  banner: Banner;
  gatewayStatus: GatewayStatus;
  historyHasOlderByBufferId: AppTransientState['historyHasOlderByBufferId'];
  historyLoadedByBufferId: AppTransientState['historyLoadedByBufferId'];
  historyLoadingOlder: AppTransientState['historyLoadingOlder'];
  networks: AppDomainState['networks'];
  phase: AppDomainState['phase'];
  networkManager: AppTransientState['networkManager'];
  selectedMessages: ChatPaneProps['selectedMessages'];
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
    applySocketMessage: params.applySocketMessage,
    dispatch: params.dispatch,
    socketRef: params.socketRef,
  });

  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const [windowFocused, setWindowFocused] = useState(() =>
    typeof document === 'undefined' ? true : document.hasFocus()
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    const handleVisibilityChange = () => setDocumentVisible(document.visibilityState === 'visible');
    const handleFocus = () => setWindowFocused(true);
    const handleBlur = () => setWindowFocused(false);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const selectedBufferHistory = useSelectedBufferEffects({
    applyServerMessages: params.applyServerMessages,
    dispatch: params.dispatch,
    documentVisible,
    gatewayStatus: params.gatewayStatus,
    historyHasOlderByBufferId: params.historyHasOlderByBufferId,
    historyLoadedByBufferId: params.historyLoadedByBufferId,
    historyLoadingOlder: params.historyLoadingOlder,
    selectedBuffer: params.workspace.selectedBuffer,
    selectedMessages: params.selectedMessages,
    windowFocused,
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

  return selectedBufferHistory;
}
