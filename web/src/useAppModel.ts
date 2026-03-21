import { useMemo } from 'react';
import { initialState, reducer, useStateReducer } from './app-state.js';
import { buildConversationModel } from './conversation-model.js';
import { useAppActions } from './useAppActions.js';
import { useAppDerivedState } from './useAppDerivedState.js';
import type { useComposerHistory } from './composer-history.js';
import type { useAppUiState } from './useAppUiState.js';

type UseAppModelParams = {
  composer: ReturnType<typeof useComposerHistory>;
  ui: ReturnType<typeof useAppUiState>;
};

export function useAppModel({ composer, ui }: UseAppModelParams) {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const conversation = useMemo(() => buildConversationModel(state.domain), [state.domain]);
  const derived = useAppDerivedState(state, conversation);
  const updateBanner = (kind: 'notice' | 'error', message: string) =>
    dispatch({ type: 'set-banner', banner: { kind, message } });
  const actions = useAppActions({
    buffers: state.domain.buffers,
    channelList: state.transient.channelList,
    conversation,
    draft: composer.draft,
    gatewayStatus: state.domain.gatewayStatus,
    networks: state.domain.networks,
    networkStates: state.domain.networkStates,
    workspace: derived.workspace,
    dispatch,
    socketRef: ui.socketRef,
    setDraft: composer.setDraft,
    recordComposerEntry: composer.recordComposerEntry,
    updateBanner,
  });

  return {
    actions,
    derived,
    dispatch,
    state,
  };
}
