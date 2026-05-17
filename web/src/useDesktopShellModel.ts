import { useMemo } from 'react';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { NavigationLayoutSettings } from './navigation-layout-settings.js';
import type { AppUiState } from './useAppUiState.js';
import type { ContactRuleHandlers } from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type {
  NicklistActionSet,
  SidebarActionSet,
} from './useAppActions.js';
export { useDesktopChatModel } from './useDesktopChatModel.js';

type DesktopHeaderModelParams = {
  dispatch: (action: Action) => void;
  navigationLayoutSettings: {
    mode: NavigationLayoutSettings['mode'];
    setMode: (mode: NavigationLayoutSettings['mode']) => void;
  };
  ui: Pick<
    AppUiState,
    'openLogInspector' | 'openPreferences'
  >;
};

type DesktopSidebarModelParams = {
  actions: SidebarActionSet;
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  nickEmojis: State['domain']['nickEmojis'];
  navigationLayoutMode: NavigationLayoutSettings['mode'];
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
  mutedNicks: State['domain']['mutedNicks'];
  nickEmojis: State['domain']['nickEmojis'];
};

export function useDesktopHeaderModel({
  dispatch,
  navigationLayoutSettings,
  ui,
}: DesktopHeaderModelParams): DesktopShellModel['header'] {
  return useMemo(
    () => ({
      navigationLayoutMode: navigationLayoutSettings.mode,
      onOpenLogInspector: ui.openLogInspector,
      onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
      onOpenPreferences: ui.openPreferences,
      onToggleNavigationLayoutMode: () => {
        navigationLayoutSettings.setMode(
          navigationLayoutSettings.mode === 'server-rail'
            ? 'all-servers-visible'
            : 'server-rail',
        );
      },
    }),
    [
      dispatch,
      navigationLayoutSettings,
      ui.openLogInspector,
      ui.openPreferences,
    ],
  );
}

export function useDesktopSidebarModel({
  actions,
  friends,
  friendPresence,
  nickEmojis,
  navigationLayoutMode,
  queryPresence,
  sidebarConnections,
  ui,
}: DesktopSidebarModelParams): DesktopShellModel['sidebar'] {
  return useMemo(
    () => ({
      connections: sidebarConnections,
      friends,
      friendPresence,
      hideOfflineFriends: ui.hideOfflineFriends,
      navigationLayoutMode,
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
      friendPresence,
      friends,
      nickEmojis,
      navigationLayoutMode,
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
  mutedNicks,
  nickEmojis,
}: DesktopNicklistModelParams): DesktopShellModel['nicklist'] {
  return useMemo(
    () => ({
      contactNotificationSettings: contactNotifications.settings,
      contactRuleHandlers,
      externalAvatarsEnabled,
      friends,
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
      mutedNicks,
      nickEmojis,
    ],
  );
}
