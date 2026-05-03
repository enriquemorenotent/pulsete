import { useEffect } from 'react';
import type { ServerMessage } from '../../shared/protocol-messages.js';
import {
  selectBanner,
  selectBuffers,
  selectNetworkManagerState,
  selectNetworks,
  selectPhase,
  selectVisibleNetworks,
  selectWorkspaceNetworkCount,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { AppUiState } from './useAppUiState.js';
import { gatewayReconnectMessage } from './gateway.js';
import { useGatewayConnection } from './useGatewayConnection.js';
import type { ComposerStoreApi } from './composer-store.js';
import {
  useAutoOpenNetworkManager,
  useManagedNetworkSelection,
} from './useNetworkManagerLifecycle.js';

type AppEffectsProps = {
  applySocketMessage: (message: ServerMessage) => void;
  composer: Pick<ComposerStoreApi, 'pruneContexts'>;
  ui: Pick<
    AppUiState,
    | 'didAutoOpenManagerRef'
    | 'socketRef'
  >;
};

export function AppEffects(props: AppEffectsProps) {
  const dispatch = useAppDispatch();
  const banner = useAppSelector(selectBanner);
  const buffers = useAppSelector(selectBuffers);
  const workspaceNetworkCount = useAppSelector(selectWorkspaceNetworkCount);
  const networkManager = useAppSelector(selectNetworkManagerState);
  const networks = useAppSelector(selectNetworks);
  const phase = useAppSelector(selectPhase);
  const visibleNetworks = useAppSelector(selectVisibleNetworks);

  useAutoOpenNetworkManager({
    phase,
    networkManagerMode: networkManager.mode,
    workspaceNetworkCount,
    didAutoOpenManagerRef: props.ui.didAutoOpenManagerRef,
    dispatch,
  });

  useManagedNetworkSelection({
    phase,
    networks,
    visibleNetworks,
    managedNetworkId: networkManager.managedNetworkId,
    dispatch,
  });

  useEffect(() => {
    if (!banner || banner.message === gatewayReconnectMessage) {
      return;
    }
    const timer = window.setTimeout(
      () => dispatch({ type: 'set-banner', banner: null }),
      4200,
    );
    return () => window.clearTimeout(timer);
  }, [banner, dispatch]);

  useGatewayConnection({
    applySocketMessage: props.applySocketMessage,
    dispatch,
    socketRef: props.ui.socketRef,
  });

  useEffect(() => {
    props.composer.pruneContexts(buffers.map((buffer) => buffer.id));
  }, [buffers, props.composer]);

  return null;
}
