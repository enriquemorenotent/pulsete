import { useMemo, useReducer } from 'react';
import { selectRightSidebarKind, selectSelectedBufferId } from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { ComposerStoreApi } from './composer-store.js';
import {
  ChatPaneContainer,
  CommandPaletteDialogContainer,
  ConnectionSidebarContainer,
  WorkspaceRightSidebarContainer,
} from './DesktopShellContainers.js';
import { LogInspectorDialogContainer } from './LogInspectorDialogContainer.js';
import { createContactRuleHandlers } from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type { NavigationLayoutSettingsController } from './navigation-layout-settings.js';
import {
  NetworkEditorDialogContainer,
  NetworkManagerDialogContainer,
  PreferencesDialogContainer,
} from './DesktopShellDialogContainers.js';
import { DesktopShellLayout } from './DesktopShellLayout.js';
import { useDesktopHeaderModel } from './useDesktopShellModel.js';
import type { UserAvatarSettingsController } from './user-avatars/settings.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';

type DesktopShellProps = {
  actions: AppActions;
  applyServerMessages: ApplyServerMessages;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  navigationLayoutSettings: NavigationLayoutSettingsController;
  userAvatarSettings: UserAvatarSettingsController;
  ui: AppUiState;
};

export function DesktopShell(props: DesktopShellProps) {
  const dispatch = useAppDispatch();
  const header = useDesktopHeaderModel({
    dispatch,
    navigationLayoutSettings: {
      mode: props.navigationLayoutSettings.settings.mode,
      setMode: props.navigationLayoutSettings.setMode,
    },
    ui: props.ui,
  });
  const rightSidebarKind = useAppSelector(selectRightSidebarKind);
  const selectedBufferId = useAppSelector(selectSelectedBufferId);
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

  return (
    <DesktopShellLayout
      header={header}
      commandPalette={commandPalette}
      onJumpChatToLatest={requestJumpToLatest}
      selectedBufferId={selectedBufferId}
      rightSidebarKind={rightSidebarKind}
      sidebar={
        <ConnectionSidebarContainer
          actions={props.actions}
          externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
          navigationLayoutSettings={props.navigationLayoutSettings}
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
          jumpToLatestRequestId={jumpToLatestRequestId}
        />
      }
      rightSidebar={
        rightSidebarKind ? (
          <WorkspaceRightSidebarContainer
            actions={props.actions}
            contactNotifications={props.contactNotifications}
            contactRuleHandlers={contactRuleHandlers}
            externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
          />
        ) : null
      }
      commandPaletteDialog={
        <CommandPaletteDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
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
          navigationLayoutSettings={props.navigationLayoutSettings}
          userAvatarSettings={props.userAvatarSettings}
          ui={props.ui}
        />
      }
      networkManagerDialog={
        <NetworkManagerDialogContainer
          actions={props.actions}
          externalAvatarsEnabled={props.userAvatarSettings.settings.externalAvatarsEnabled}
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
}
