import { useCallback, useMemo, useRef } from 'react';
import { initialState, reducer, useStateReducer } from './app-state.js';
import { createLiveAppActions } from './useAppActions.js';
import { useAppDerivedState } from './useAppDerivedState.js';
import type { ComposerController } from './composer-history.js';
import type { AppUiState } from './useAppUiState.js';

type UseAppModelParams = {
  composer: ComposerController;
  ui: AppUiState;
};

export function useAppModel({ composer, ui }: UseAppModelParams) {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const model = useAppDerivedState(state);
  const liveStateRef = useRef({
    buffers: state.domain.buffers,
    channelList: state.transient.channelList,
    conversation: model.conversation,
    draft: composer.draft,
    gatewayStatus: state.domain.gatewayStatus,
    networks: state.domain.networks,
    networkStates: state.domain.networkStates,
    workspace: model.workspace,
  });
  liveStateRef.current = {
    buffers: state.domain.buffers,
    channelList: state.transient.channelList,
    conversation: model.conversation,
    draft: composer.draft,
    gatewayStatus: state.domain.gatewayStatus,
    networks: state.domain.networks,
    networkStates: state.domain.networkStates,
    workspace: model.workspace,
  };
  const updateBanner = useCallback(
    (kind: 'notice' | 'error', message: string) =>
      dispatch({ type: 'set-banner', banner: { kind, message } }),
    [dispatch]
  );
  const actions = useMemo(
    () => createLiveAppActions({
      getBuffers: () => liveStateRef.current.buffers,
      getChannelList: () => liveStateRef.current.channelList,
      getConversation: () => liveStateRef.current.conversation,
      getDraft: () => liveStateRef.current.draft,
      getGatewayStatus: () => liveStateRef.current.gatewayStatus,
      getNetworks: () => liveStateRef.current.networks,
      getNetworkStates: () => liveStateRef.current.networkStates,
      getWorkspace: () => liveStateRef.current.workspace,
      dispatch,
      socketRef: ui.socketRef,
      setDraft: composer.setDraft,
      recordComposerEntry: composer.recordComposerEntry,
      updateBanner,
    }),
    [
      composer.recordComposerEntry,
      composer.setDraft,
      dispatch,
      ui.socketRef,
      updateBanner,
    ]
  );

  return {
    actions,
    model,
    dispatch,
    state,
  };
}
