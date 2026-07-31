import { memo, useCallback, useMemo, useReducer } from 'react';
import { selectPreferences, selectRightSidebarKind, selectSelectedBufferId } from './app-selectors.js';
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
import {
  resolveMediaVisibilityPolicy,
  type MediaVisibilitySettingsController,
} from './media-visibility-settings.js';
import { useDesktopHeaderModel } from './useDesktopShellModel.js';
import type { UserAvatarSettingsController } from './user-avatars/settings.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';

export type DesktopShellProps = {
  actions: AppActions;
  applyServerMessages: ApplyServerMessages;
  assistantStore: AiAssistantStoreApi;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  mediaVisibilitySettings: MediaVisibilitySettingsController;
  onDownloadDiagnostics: () => void;
  userAvatarSettings: UserAvatarSettingsController;
  ui: AppUiState;
};

export const DesktopShell = memo(function DesktopShell(props: DesktopShellProps) {
  const dispatch = useAppDispatch();
  const mediaPolicy = useMemo(
    () => resolveMediaVisibilityPolicy(props.mediaVisibilitySettings.settings),
    [props.mediaVisibilitySettings.settings],
  );
  const header = useDesktopHeaderModel({
    dispatch,
    mediaVisibilitySettings: {
      mode: props.mediaVisibilitySettings.settings.mode,
      setMode: props.mediaVisibilitySettings.setMode,
    },
    onDownloadDiagnostics: props.onDownloadDiagnostics,
    ui: props.ui,
  });
  const rightSidebarKind = useAppSelector(selectRightSidebarKind);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
  const preferences = useAppSelector(selectPreferences);
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

  return (
    <DesktopShellLayout
      header={header}
      commandPalette={commandPalette}
      onJumpChatToLatest={requestJumpToLatest}
      selectedBufferId={selectedBufferId}
      rightSidebarKind={rightSidebarKind}
      leftSidebarWidth={preferences.leftSidebarWidth}
      rightSidebarWidth={preferences.rightSidebarWidth}
      onSetLeftSidebarWidth={setLeftSidebarWidth}
      onSetRightSidebarWidth={setRightSidebarWidth}
      sidebar={
        <ConnectionSidebarContainer
          actions={props.actions}
          externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
          mediaPolicy={mediaPolicy}
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
          mediaPolicy={mediaPolicy}
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
            externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
            mediaPolicy={mediaPolicy}
          />
        ) : null
      }
      commandPaletteDialog={
        <CommandPaletteDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
          mediaPolicy={mediaPolicy}
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
          mediaVisibilitySettings={props.mediaVisibilitySettings}
          userAvatarSettings={props.userAvatarSettings}
          ui={props.ui}
        />
      }
      networkManagerDialog={
        <NetworkManagerDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
          mediaPolicy={mediaPolicy}
        />
      }
      networkEditorDialog={
        <NetworkEditorDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
        />
      }
    />
  );
});
