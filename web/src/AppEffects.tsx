import { useEffect, type MutableRefObject } from 'react';
import type { ServerMessage } from '../../shared/protocol.js';
import type { BackgroundDmAudioSettings } from './background-dm-audio.js';
import {
  selectBanner,
  selectBuffers,
  selectNetworkManagerState,
  selectNetworkNamesById,
  selectNetworks,
  selectPhase,
  selectSelectedBufferId,
  selectVisibleNetworks,
  selectWorkspaceNetworkCount,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { AppActions } from './useAppActions.js';
import {
  useBackgroundDmAudioCue,
  type BackgroundDmAudioState,
} from './useBackgroundDmAudio.js';
import type { AppUiState } from './useAppUiState.js';
import { gatewayReconnectMessage } from './gateway.js';
import { useGatewayConnection } from './useGatewayConnection.js';
import {
  useAutoOpenNetworkManager,
  useManagedNetworkSelection,
} from './useNetworkManagerLifecycle.js';

type AppEffectsProps = {
  actions: Pick<AppActions, 'selectTabBuffer'>;
  applySocketMessage: (message: ServerMessage) => void;
  backgroundDmAudio: Pick<BackgroundDmAudioState, 'settings'>;
  previewBackgroundDmAudioRef: MutableRefObject<
    (sound: BackgroundDmAudioSettings['sound']) => void
  >;
  primeBackgroundDmAudioRef: MutableRefObject<() => void>;
  ui: Pick<
    AppUiState,
    | 'bufferToolDialog'
    | 'closeBufferToolDialog'
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
  const networkNamesById = useAppSelector(selectNetworkNamesById);
  const networks = useAppSelector(selectNetworks);
  const phase = useAppSelector(selectPhase);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
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
    if (!props.ui.bufferToolDialog) {
      return;
    }
    if (props.ui.bufferToolDialog.bufferId === selectedBufferId) {
      return;
    }
    props.ui.closeBufferToolDialog();
  }, [
    props.ui.bufferToolDialog,
    props.ui.closeBufferToolDialog,
    selectedBufferId,
  ]);

  const { prime, preview } = useBackgroundDmAudioCue({
    buffers,
    networkNamesById,
    onSelectBuffer: props.actions.selectTabBuffer,
    selectedBufferId,
    settings: props.backgroundDmAudio.settings,
  });

  useEffect(() => {
    props.primeBackgroundDmAudioRef.current = prime;
    props.previewBackgroundDmAudioRef.current = preview;
    return () => {
      props.primeBackgroundDmAudioRef.current = () => undefined;
      props.previewBackgroundDmAudioRef.current = () => undefined;
    };
  }, [preview, prime, props.previewBackgroundDmAudioRef, props.primeBackgroundDmAudioRef]);

  return null;
}
