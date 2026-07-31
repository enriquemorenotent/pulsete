import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppEffects } from './AppEffects.js';
import { selectSelectedBufferId } from './app-selectors.js';
import { AppStoreProvider, createAppStore } from './app-store.js';
import { initialState } from './app-state.js';
import { AppBody } from './AppBody.js';
import { createClientDiagnosticsRecorder } from './client-diagnostics.js';
import { createComposerStore } from './composer-store.js';
import { createAiAssistantStore } from './ai-assistant-store.js';
import { createServerMessageBridge } from './server-message-bridge.js';
import { createLiveAppActions } from './useAppActions.js';
import { useAppUiState } from './useAppUiState.js';

function App() {
  const ui = useAppUiState();
  const [{ diagnostics, store }] = useState(() => {
    const diagnosticsRecorder = createClientDiagnosticsRecorder();
    const appStore = createAppStore(initialState, {
      onDispatch: diagnosticsRecorder.recordStoreDispatch,
      onListenerCountChange: diagnosticsRecorder.recordStoreListenerCount,
    });
    return { diagnostics: diagnosticsRecorder, store: appStore };
  });
  const [assistantStore] = useState(createAiAssistantStore);
  const [composer] = useState(createComposerStore);
  const updateBanner = useCallback(
    (kind: 'notice' | 'error', message: string) =>
      store.dispatch({
        type: 'set-banner',
        banner: { kind, message },
      }),
    [store],
  );
  const downloadDiagnostics = useCallback(() => {
    const state = store.getState();
    updateBanner('notice', 'Capturing memory diagnostics...');
    void diagnostics.download(state).then(
      () => updateBanner('notice', 'Memory diagnostics downloaded.'),
      () => updateBanner('error', 'Could not create the memory diagnostics file.'),
    );
  }, [diagnostics, store, updateBanner]);
  const serverMessages = useMemo(
    () => createServerMessageBridge(store),
    [store],
  );
  const actions = useMemo(
    () =>
      createLiveAppActions({
        applyServerMessages: serverMessages.applyMutationMessages,
        getDraft: composer.getDraft,
        getState: store.getState,
        dispatch: store.dispatch,
        socketRef: ui.socketRef,
        setDraft: (value, contextKey) =>
          composer.setDraft(
            contextKey ?? selectSelectedBufferId(store.getState()),
            value,
          ),
        recordComposerEntry: (value, contextKey) =>
          composer.recordComposerEntry(
            contextKey ?? selectSelectedBufferId(store.getState()),
            value,
          ),
        updateBanner,
      }),
    [composer, serverMessages.applyMutationMessages, store, ui.socketRef, updateBanner],
  );

  useEffect(
    () => diagnostics.start(store.getState),
    [diagnostics, store],
  );

  return (
    <AppStoreProvider store={store}>
      <AppEffects
        applyServerMessages={serverMessages.applyMutationMessages}
        applySocketMessage={serverMessages.applySocketMessage}
        assistantStore={assistantStore}
        composer={composer}
        saveDraft={actions.saveDraft}
        socketInstrumentation={diagnostics.socketInstrumentation}
        ui={ui}
      />
      <AppBody
        actions={actions}
        applyServerMessages={serverMessages.applyMutationMessages}
        assistantStore={assistantStore}
        composer={composer}
        onDownloadDiagnostics={downloadDiagnostics}
        ui={ui}
      />
    </AppStoreProvider>
  );
}

export default App;
