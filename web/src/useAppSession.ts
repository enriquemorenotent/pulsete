import { useCallback, useMemo, useRef } from 'react';
import { initialState, reducer, useStateReducer } from './app-state.js';
import { createAppSessionSnapshot, type AppSessionSnapshot } from './app-session.js';
import { createLiveAppActions } from './useAppActions.js';
import { useAppDerivedState } from './useAppDerivedState.js';
import type { ComposerController } from './composer-history.js';
import type { AppUiState } from './useAppUiState.js';

type UseAppSessionParams = {
  composer: ComposerController;
  ui: AppUiState;
};

export function useAppSession({ composer, ui }: UseAppSessionParams) {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const model = useAppDerivedState(state);
  const session = useMemo(() => createAppSessionSnapshot({
    draft: composer.draft,
    model,
    state,
  }), [composer.draft, model, state]);
  const liveSessionRef = useRef<AppSessionSnapshot>(session);
  liveSessionRef.current = session;
  const updateBanner = useCallback(
    (kind: 'notice' | 'error', message: string) =>
      dispatch({ type: 'set-banner', banner: { kind, message } }),
    [dispatch]
  );
  const actions = useMemo(
    () => createLiveAppActions({
      readState: () => liveSessionRef.current,
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
    dispatch,
    model,
    session,
    state,
  };
}
