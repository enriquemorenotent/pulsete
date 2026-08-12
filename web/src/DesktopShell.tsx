import { memo, useCallback, useMemo, useReducer, useState } from 'react';
import {
  selectHistoryHasNewerByBufferId,
  selectPreferences,
  selectRightSidebarKind,
  selectSelectedBufferId,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { ComposerStoreApi } from './composer-store.js';
import {
  ChatPaneContainer,
  CommandPaletteDialogContainer,
  ConnectionSidebarContainer,
} from './DesktopShellContainers.js';
import { WorkspaceRightSidebarContainer } from './WorkspaceRightSidebarContainer.js';
import { LogInspectorDialogContainer } from './LogInspectorDialogContainer.js';
import { createContactRuleHandlers } from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import {
  NetworkEditorDialogContainer,
  NetworkManagerDialogContainer,
  PreferencesDialogContainer,
} from './DesktopShellDialogContainers.js';
import { DesktopShellLayout } from './DesktopShellLayout.js';
import type { MediaVisibilityMode } from './media-visibility-settings.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';

export type DesktopShellProps = {
  actions: AppActions;
  applyServerMessages: ApplyServerMessages;
  assistantStore: AiAssistantStoreApi;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  externalAvatarsEnabled: boolean;
  mediaVisibilityMode: MediaVisibilityMode;
  onSetExternalAvatarsEnabled: (enabled: boolean) => void;
  onSetMediaVisibilityMode: (mode: MediaVisibilityMode) => void;
  onDownloadDiagnostics: () => void;
  ui: AppUiState;
};

export const DesktopShell = memo(function DesktopShell(props: DesktopShellProps) {
  const dispatch = useAppDispatch();
  const showMedia = props.mediaVisibilityMode === 'show-media';
  const header = useMemo(() => ({
    mediaVisibilityMode: props.mediaVisibilityMode,
    onDownloadDiagnostics: props.onDownloadDiagnostics,
    onOpenLogInspector: props.ui.openLogInspector,
    onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
    onOpenPreferences: props.ui.openPreferences,
    onToggleMediaVisibilityMode: () => {
      props.onSetMediaVisibilityMode(
        props.mediaVisibilityMode === 'show-media'
          ? 'hide-media'
          : 'show-media',
      );
    },
  }), [
    dispatch,
    props.mediaVisibilityMode,
    props.onSetMediaVisibilityMode,
    props.onDownloadDiagnostics,
    props.ui.openLogInspector,
    props.ui.openPreferences,
  ]);
  const rightSidebarKind = useAppSelector(selectRightSidebarKind);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
  const historyHasNewerByBufferId = useAppSelector(selectHistoryHasNewerByBufferId);
  const preferences = useAppSelector(selectPreferences);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [jumpToLatestRequestId, requestJumpToLatest] = useReducer(
    (value: number) => value + 1,
    0,
  );
  const commandPalette = useMemo(
    () => ({
      onOpen: props.ui.openCommandPalette,
      open: props.ui.commandPaletteOpen,
    }),
    [props.ui.commandPaletteOpen, props.ui.openCommandPalette],
  );
  const contactRuleHandlers = useMemo(
    () =>
      createContactRuleHandlers({
        addFriend: props.actions.addFriend,
        addMutedNick: props.actions.addMutedNick,
        addNotificationContact: props.contactNotifications.addContact,
        notificationsUseSound: props.contactNotifications.settings.enabled,
        primeNotifications: props.contactNotifications.prime,
        removeFriend: props.actions.removeFriend,
        removeMutedNick: props.actions.removeMutedNick,
        removeNotificationContact: props.contactNotifications.removeContact,
      }),
    [
      props.actions.addFriend,
      props.actions.addMutedNick,
      props.actions.removeFriend,
      props.actions.removeMutedNick,
      props.contactNotifications.addContact,
      props.contactNotifications.prime,
      props.contactNotifications.removeContact,
      props.contactNotifications.settings.enabled,
    ],
  );
  const setLeftSidebarWidth = useCallback((width: number) => {
    void props.actions.updatePreferences({ leftSidebarWidth: width });
  }, [props.actions]);
  const setRightSidebarWidth = useCallback((width: number) => {
    void props.actions.updatePreferences({ rightSidebarWidth: width });
  }, [props.actions]);
  const collapseRightSidebar = useCallback(() => setRightSidebarCollapsed(true), []);
  const expandRightSidebar = useCallback(() => setRightSidebarCollapsed(false), []);
  const jumpChatToLatest = useCallback(() => {
    if (selectedBufferId && historyHasNewerByBufferId[selectedBufferId] === true) {
      void props.actions.returnBufferToLatest(selectedBufferId).then((returned) => {
        if (returned) {
          requestJumpToLatest();
        }
      });
      return;
    }
    requestJumpToLatest();
  }, [historyHasNewerByBufferId, props.actions, selectedBufferId]);

  return (
    <DesktopShellLayout
      header={header}
      commandPalette={commandPalette}
      onJumpChatToLatest={jumpChatToLatest}
      selectedBufferId={selectedBufferId}
      rightSidebarKind={rightSidebarKind}
      rightSidebarCollapsed={rightSidebarCollapsed}
      leftSidebarWidth={preferences.leftSidebarWidth}
      rightSidebarWidth={preferences.rightSidebarWidth}
      onSetLeftSidebarWidth={setLeftSidebarWidth}
      onSetRightSidebarWidth={setRightSidebarWidth}
      onExpandRightSidebar={expandRightSidebar}
      sidebar={
        <ConnectionSidebarContainer
          actions={props.actions}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          showMedia={showMedia}
          ui={props.ui}
        />
      }
      chat={
        <ChatPaneContainer
          actions={props.actions}
          applyServerMessages={props.applyServerMessages}
          composer={props.composer}
          contactNotifications={props.contactNotifications}
          contactRuleHandlers={contactRuleHandlers}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          showMedia={showMedia}
          jumpToLatestRequestId={jumpToLatestRequestId}
        />
      }
      rightSidebar={
        rightSidebarKind ? (
          <WorkspaceRightSidebarContainer
            actions={props.actions}
            assistantStore={props.assistantStore}
            composer={props.composer}
            contactNotifications={props.contactNotifications}
            contactRuleHandlers={contactRuleHandlers}
            externalAvatarsEnabled={props.externalAvatarsEnabled}
            showMedia={showMedia}
            onCollapse={collapseRightSidebar}
          />
        ) : null
      }
      commandPaletteDialog={
        <CommandPaletteDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          showMedia={showMedia}
          ui={props.ui}
        />
      }
      logInspectorDialog={
        <LogInspectorDialogContainer actions={props.actions} ui={props.ui} />
      }
      preferencesDialog={
        <PreferencesDialogContainer
          actions={props.actions}
          contactNotifications={props.contactNotifications}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          mediaVisibilityMode={props.mediaVisibilityMode}
          onSetExternalAvatarsEnabled={props.onSetExternalAvatarsEnabled}
          onSetMediaVisibilityMode={props.onSetMediaVisibilityMode}
          ui={props.ui}
        />
      }
      networkManagerDialog={
        <NetworkManagerDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          showMedia={showMedia}
        />
      }
      networkEditorDialog={
        <NetworkEditorDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
        />
      }
    />
  );
});
