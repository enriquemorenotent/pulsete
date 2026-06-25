import { useCallback, useMemo, useRef } from 'react';
import { AppEffects } from './AppEffects.js';
import {
  selectBuffers,
  selectMessagesByConversation,
  selectNetworkNamesById,
  selectPhase,
  selectSelectedBufferId,
} from './app-selectors.js';
import { AppStoreProvider, createAppStore, useAppSelector } from './app-store.js';
import { createComposerStore } from './composer-store.js';
import { useContactNotifications } from './contact-notifications/controller.js';
import { DesktopShell } from './DesktopShell.js';
import {
  resolveMediaVisibilityPolicy,
  useMediaVisibilitySettings,
} from './media-visibility-settings.js';
import { ToastContainer } from './ToastContainer.js';
import { useUserAvatarSettings } from './user-avatars/settings.js';
import { createLiveAppActions } from './useAppActions.js';
import { useAppUiState } from './useAppUiState.js';
import { createServerMessageBridge } from './server-message-bridge.js';

function App() {
  const ui = useAppUiState();
  const storeRef = useRef(createAppStore());
  const composerRef = useRef(createComposerStore());
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
        applySocketMessage={serverMessages.applySocketMessage}
        composer={composerRef.current}
        ui={ui}
      />
      <AppBody
        actions={actions}
        applyServerMessages={serverMessages.applyMutationMessages}
        composer={composerRef.current}
        ui={ui}
      />
    </AppStoreProvider>
  );
}

type AppBodyProps = Omit<
  Parameters<typeof DesktopShell>[0],
  'contactNotifications' | 'mediaVisibilitySettings' | 'userAvatarSettings'
>;

function AppBody(props: AppBodyProps) {
  const phase = useAppSelector(selectPhase);
  const buffers = useAppSelector(selectBuffers);
  const messagesByConversation = useAppSelector(selectMessagesByConversation);
  const networkNamesById = useAppSelector(selectNetworkNamesById);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
  const mediaVisibilitySettings = useMediaVisibilitySettings();
  const mediaPolicy = useMemo(
    () => resolveMediaVisibilityPolicy(mediaVisibilitySettings.settings),
    [mediaVisibilitySettings.settings],
  );
  const contactNotifications = useContactNotifications({
    buffers,
    systemNotificationIconsEnabled: mediaPolicy.showNotificationIcons,
    messagesByConversation,
    networkNamesById,
    onSelectBuffer: props.actions.selectTabBuffer,
    selectedBufferId,
  });
  const userAvatarSettings = useUserAvatarSettings();

  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <DesktopShell
        {...props}
        contactNotifications={contactNotifications}
        mediaVisibilitySettings={mediaVisibilitySettings}
        userAvatarSettings={userAvatarSettings}
      />
      <ToastContainer />
    </>
  );
}

export default App;
