import { useMemo } from 'react';
import { initialState, reducer, useStateReducer } from './app-state.js';
import type { State } from './app-types.js';
import { buildConversationModel } from './conversation-model.js';
import { useAppActions } from './useAppActions.js';
import { useAppDerivedState } from './useAppDerivedState.js';
import { useAppLifecycle } from './useAppLifecycle.js';
import { useDesktopShellController } from './useDesktopShellController.js';
import { useAppUiState } from './useAppUiState.js';
import { useComposerHistory } from './composer-history.js';

type AppController = {
  banner: State['transient']['banner'];
  desktopShellProps: ReturnType<typeof useDesktopShellController>;
  dismissBanner: () => void;
  phase: State['domain']['phase'];
};

export function useAppController(): AppController {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const composer = useComposerHistory();
  const ui = useAppUiState();
  const conversation = useMemo(() => buildConversationModel(state.domain), [state.domain]);
  const derived = useAppDerivedState(state, conversation, ui.showFavoritesOnly, ui.managedNetworkId);
  const updateBanner = (kind: 'notice' | 'error', message: string) =>
    dispatch({ type: 'set-banner', banner: { kind, message } });

  useAppLifecycle({
    banner: state.transient.banner,
    gatewayStatus: state.domain.gatewayStatus,
    networks: state.domain.networks,
    phase: state.domain.phase,
    workspace: derived.workspace,
    visibleNetworks: derived.visibleNetworks,
    managedNetworkId: ui.managedNetworkId,
    dispatch,
    setShowNetworkManager: ui.setShowNetworkManager,
    setManagedNetworkId: ui.setManagedNetworkId,
    socketRef: ui.socketRef,
    scrollRef: ui.scrollRef,
    didAutoOpenManagerRef: ui.didAutoOpenManagerRef,
  });

  const actions = useAppActions({
    conversation,
    state,
    draft: composer.draft,
    workspace: derived.workspace,
    dispatch,
    socketRef: ui.socketRef,
    setDraft: composer.setDraft,
    recordComposerEntry: composer.recordComposerEntry,
    updateBanner,
  });
  const desktopShellProps = useDesktopShellController({ actions, composer, derived, dispatch, state, ui });

  return {
    phase: state.domain.phase,
    banner: state.transient.banner,
    dismissBanner: () => dispatch({ type: 'set-banner', banner: null }),
    desktopShellProps,
  };
}
