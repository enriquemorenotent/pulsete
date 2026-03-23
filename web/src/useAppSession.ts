import { useCallback, useMemo, useRef } from 'react';
import { initialState, reducer, useStateReducer } from './app-state.js';
import { createAppSessionSnapshot, type AppSessionSnapshot } from './app-session.js';
import { createLiveAppActions } from './useAppActions.js';
import { createServerMessageBridge } from './server-message-bridge.js';
import { useConversationModel, useWorkspaceView } from './useAppDerivedState.js';
import type { ComposerController } from './composer-history.js';
import type { AppUiState } from './useAppUiState.js';

type UseAppSessionParams = {
  composer: ComposerController;
  ui: AppUiState;
};

export function useAppSession({ composer, ui }: UseAppSessionParams) {
  const [state, dispatch] = useStateReducer(reducer, initialState);
  const conversation = useConversationModel(state);
  const workspace = useWorkspaceView(state, conversation);
  const session = useMemo(() => createAppSessionSnapshot({
    conversation,
    draft: composer.draft,
    state,
    workspace,
  }), [composer.draft, conversation, state, workspace]);
  const liveSessionRef = useRef<AppSessionSnapshot>(session);
  liveSessionRef.current = session;
  const serverMessages = useMemo(() => createServerMessageBridge(dispatch), [dispatch]);
  const updateBanner = useCallback(
    (kind: 'notice' | 'error', message: string) =>
      dispatch({ type: 'set-banner', banner: { kind, message } }),
    [dispatch]
  );
  const actions = useMemo(
    () => createLiveAppActions({
      applyServerMessages: serverMessages.applyMutationMessages,
      getSession: () => liveSessionRef.current,
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
      serverMessages,
      ui.socketRef,
      updateBanner,
    ]
  );

  return {
    actions,
    conversation,
    dispatch,
    serverMessages,
    session,
    state,
    workspace,
  };
}
