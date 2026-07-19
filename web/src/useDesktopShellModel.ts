import { useMemo } from 'react';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppUiState } from './useAppUiState.js';
import type { ContactRuleHandlers } from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type {
  NicklistActionSet,
  SidebarActionSet,
} from './useAppActions.js';
import type {
  MediaVisibilityMode,
  MediaVisibilityPolicy,
} from './media-visibility-settings.js';
export { useDesktopChatModel } from './useDesktopChatModel.js';

type DesktopHeaderModelParams = {
  dispatch: (action: Action) => void;
  mediaVisibilitySettings: {
    mode: MediaVisibilityMode;
    setMode: (mode: MediaVisibilityMode) => void;
  };
  onDownloadDiagnostics: () => void;
  ui: Pick<
    AppUiState,
    'openLogInspector' | 'openPreferences'
  >;
};

type DesktopSidebarModelParams = {
  actions: SidebarActionSet;
  externalAvatarsEnabled: boolean;
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  mediaPolicy: MediaVisibilityPolicy;
  nickEmojis: State['domain']['nickEmojis'];
  queryPresence: State['domain']['queryPresence'];
  sidebarConnections: ConnectionSidebarProps['connections'];
  ui: Pick<AppUiState, 'hideOfflineFriends' | 'toggleHideOfflineFriends'>;
};

type DesktopNicklistModelParams = {
  actions: NicklistActionSet;
  contactNotifications: Pick<ContactNotificationsController, 'settings'>;
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
  friends: State['domain']['friends'];
  mediaPolicy: MediaVisibilityPolicy;
  mutedNicks: State['domain']['mutedNicks'];
  nickEmojis: State['domain']['nickEmojis'];
};

export function useDesktopHeaderModel({
  dispatch,
  mediaVisibilitySettings,
  onDownloadDiagnostics,
  ui,
}: DesktopHeaderModelParams): DesktopShellModel['header'] {
  const { mode, setMode } = mediaVisibilitySettings;
  return useMemo(
    () => ({
      mediaVisibilityMode: mode,
      onDownloadDiagnostics,
      onOpenLogInspector: ui.openLogInspector,
      onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
      onOpenPreferences: ui.openPreferences,
      onToggleMediaVisibilityMode: () => {
        setMode(
          mode === 'show-media'
            ? 'hide-media'
            : 'show-media',
        );
      },
    }),
    [
      dispatch,
      mode,
      onDownloadDiagnostics,
      setMode,
      ui.openLogInspector,
      ui.openPreferences,
    ],
  );
}

export function useDesktopSidebarModel({
  actions,
  externalAvatarsEnabled,
  friends,
  friendPresence,
  mediaPolicy,
  nickEmojis,
  queryPresence,
  sidebarConnections,
  ui,
}: DesktopSidebarModelParams): DesktopShellModel['sidebar'] {
  return useMemo(
    () => ({
      connections: sidebarConnections,
      externalAvatarsEnabled,
      friends,
      friendPresence,
      hideOfflineFriends: ui.hideOfflineFriends,
      mediaPolicy,
      nickEmojis,
      queryPresence,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      onSelectFriend: actions.selectFriend,
      onToggleHideOfflineFriends: ui.toggleHideOfflineFriends,
      onSelectNetwork: actions.selectNetworkBuffer,
      onSelectBuffer: actions.selectTabBuffer,
      onSelectPendingChannel: actions.selectPendingTab,
      onReconnectNetwork: actions.reconnectNetwork,
      onDisconnectNetwork: actions.disconnectNetwork,
      onCloseConnection: actions.closeConnection,
      onCloseChannel: actions.closeChannel,
      onCloseBuffer: actions.closeBuffer,
    }),
    [
      actions.addFriend,
      actions.closeBuffer,
      actions.closeChannel,
      actions.closeConnection,
      actions.disconnectNetwork,
      actions.reconnectNetwork,
      actions.removeFriend,
      actions.selectFriend,
      actions.selectNetworkBuffer,
      actions.selectPendingTab,
      actions.selectTabBuffer,
      externalAvatarsEnabled,
      friendPresence,
      friends,
      mediaPolicy,
      nickEmojis,
      queryPresence,
      sidebarConnections,
      ui.hideOfflineFriends,
      ui.toggleHideOfflineFriends,
    ],
  );
}

export function useDesktopNicklistModel({
  actions,
  contactNotifications,
  contactRuleHandlers,
  externalAvatarsEnabled,
  friends,
  mediaPolicy,
  mutedNicks,
  nickEmojis,
}: DesktopNicklistModelParams): DesktopShellModel['nicklist'] {
  return useMemo(
    () => ({
      contactNotificationSettings: contactNotifications.settings,
      contactRuleHandlers,
      externalAvatarsEnabled,
      friends,
      mediaPolicy,
      mutedNicks,
      nickEmojis,
      onSaveNickEmoji: actions.saveNickEmoji,
      onSelectNick: actions.selectPrivateBuffer,
    }),
    [
      actions.saveNickEmoji,
      actions.selectPrivateBuffer,
      contactNotifications.settings,
      contactRuleHandlers,
      externalAvatarsEnabled,
      friends,
      mediaPolicy,
      mutedNicks,
      nickEmojis,
    ],
  );
}
