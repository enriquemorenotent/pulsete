import { useCallback, useMemo, useState } from 'react';
import { AppEffects } from './AppEffects.js';
import { selectSelectedBufferId } from './app-selectors.js';
import { AppStoreProvider, createAppStore } from './app-store.js';
import { AppBody } from './AppBody.js';
import { createComposerStore } from './composer-store.js';
import { createServerMessageBridge } from './server-message-bridge.js';
import { createLiveAppActions } from './useAppActions.js';
import { useAppUiState } from './useAppUiState.js';

function App() {
  const ui = useAppUiState();
  const [store] = useState(createAppStore);
  const [composer] = useState(createComposerStore);
  const updateBanner = useCallback(
    (kind: 'notice' | 'error', message: string) =>
      store.dispatch({
        type: 'set-banner',
        banner: { kind, message },
      }),
    [store],
  );
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

  return (
    <AppStoreProvider store={store}>
      <AppEffects
        applySocketMessage={serverMessages.applySocketMessage}
        composer={composer}
        ui={ui}
      />
      <AppBody
        actions={actions}
        applyServerMessages={serverMessages.applyMutationMessages}
        composer={composer}
        ui={ui}
      />
    </AppStoreProvider>
  );
}

export default App;
