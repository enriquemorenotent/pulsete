import { useCallback, useMemo, useRef } from 'react';
import type { BackgroundDmAudioSettings } from './background-dm-audio.js';
import { AppEffects } from './AppEffects.js';
import { selectSelectedBufferId, selectPhase } from './app-selectors.js';
import { AppStoreProvider, createAppStore, useAppSelector } from './app-store.js';
import { createComposerStore } from './composer-store.js';
import { DesktopShell } from './DesktopShell.js';
import { ToastContainer } from './ToastContainer.js';
import { createLiveAppActions } from './useAppActions.js';
import { useBackgroundDmAudioSettings } from './useBackgroundDmAudio.js';
import { useAppUiState } from './useAppUiState.js';
import { createServerMessageBridge } from './server-message-bridge.js';

function App() {
  const backgroundDmAudio = useBackgroundDmAudioSettings();
  const ui = useAppUiState();
  const storeRef = useRef(createAppStore());
  const composerRef = useRef(createComposerStore());
  const primeBackgroundDmAudioRef = useRef<() => void>(() => undefined);
  const previewBackgroundDmAudioRef = useRef<
    (sound: BackgroundDmAudioSettings['sound']) => void
  >(() => undefined);
  const updateBanner = useCallback(
    (kind: 'notice' | 'error', message: string) =>
      storeRef.current.dispatch({
        type: 'set-banner',
        banner: { kind, message },
      }),
    [],
  );
  const serverMessages = useMemo(
    () => createServerMessageBridge(storeRef.current),
    [],
  );
  const actions = useMemo(
    () =>
      createLiveAppActions({
        applyServerMessages: serverMessages.applyMutationMessages,
        getDraft: composerRef.current.getDraft,
        getState: storeRef.current.getState,
        dispatch: storeRef.current.dispatch,
        socketRef: ui.socketRef,
        setDraft: (value, contextKey) =>
          composerRef.current.setDraft(
            contextKey ?? selectSelectedBufferId(storeRef.current.getState()),
            value,
          ),
        recordComposerEntry: (value, contextKey) =>
          composerRef.current.recordComposerEntry(
            contextKey ?? selectSelectedBufferId(storeRef.current.getState()),
            value,
          ),
        updateBanner,
      }),
    [serverMessages.applyMutationMessages, ui.socketRef, updateBanner],
  );

  return (
    <AppStoreProvider store={storeRef.current}>
      <AppEffects
        actions={actions}
        applySocketMessage={serverMessages.applySocketMessage}
        backgroundDmAudio={backgroundDmAudio}
        composer={composerRef.current}
        previewBackgroundDmAudioRef={previewBackgroundDmAudioRef}
        primeBackgroundDmAudioRef={primeBackgroundDmAudioRef}
        ui={ui}
      />
      <AppBody
        actions={actions}
        applyServerMessages={serverMessages.applyMutationMessages}
        backgroundDmAudio={backgroundDmAudio}
        composer={composerRef.current}
        previewBackgroundDmAudio={(sound) =>
          previewBackgroundDmAudioRef.current(sound)
        }
        primeBackgroundDmAudio={() => primeBackgroundDmAudioRef.current()}
        ui={ui}
      />
    </AppStoreProvider>
  );
}

function AppBody(props: Parameters<typeof DesktopShell>[0]) {
  const phase = useAppSelector(selectPhase);

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <DesktopShell {...props} />
      <ToastContainer />
    </>
  );
}

export default App;
