import { useMemo } from 'react';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppUiState } from './useAppUiState.js';
import type { BackgroundDmAudioState } from './useBackgroundDmAudio.js';
import type {
  NicklistActionSet,
  SidebarActionSet,
} from './useAppActions.js';
export { useDesktopChatModel } from './useDesktopChatModel.js';

type DesktopHeaderModelParams = {
  dispatch: (action: Action) => void;
  ui: Pick<
    AppUiState,
    'openPreferences'
  >;
};

type DesktopSidebarModelParams = {
  actions: SidebarActionSet;
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  nickEmojis: State['domain']['nickEmojis'];
  queryPresence: State['domain']['queryPresence'];
  sidebarConnections: ConnectionSidebarProps['connections'];
  ui: Pick<AppUiState, 'hideOfflineFriends' | 'toggleHideOfflineFriends'>;
};

type DesktopNicklistModelParams = {
  actions: NicklistActionSet;
  backgroundDmAudio: Pick<BackgroundDmAudioState, 'addContact' | 'removeContact' | 'settings'>;
  friends: State['domain']['friends'];
  mutedNicks: State['domain']['mutedNicks'];
  nickEmojis: State['domain']['nickEmojis'];
  primeBackgroundDmAudio: () => void;
};

export function useDesktopHeaderModel({
  dispatch,
  ui,
}: DesktopHeaderModelParams): DesktopShellModel['header'] {
  return useMemo(
    () => ({
      onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
      onOpenPreferences: ui.openPreferences,
    }),
    [
      dispatch,
      ui.openPreferences,
    ],
  );
}

export function useDesktopSidebarModel({
  actions,
  friends,
  friendPresence,
  nickEmojis,
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
      queryPresence,
      sidebarConnections,
      ui.hideOfflineFriends,
      ui.toggleHideOfflineFriends,
    ],
  );
}

export function useDesktopNicklistModel({
  actions,
  backgroundDmAudio,
  friends,
  mutedNicks,
  nickEmojis,
  primeBackgroundDmAudio,
}: DesktopNicklistModelParams): DesktopShellModel['nicklist'] {
  return useMemo(
    () => ({
      backgroundDmAudio: backgroundDmAudio.settings,
      friends,
      mutedNicks,
      nickEmojis,
      onAddFriend: actions.addFriend,
      onAddNotificationContact: (contact) => {
        backgroundDmAudio.addContact(contact);
        if (backgroundDmAudio.settings.enabled) {
          primeBackgroundDmAudio();
        }
      },
      onAddMutedNick: actions.addMutedNick,
      onRemoveFriend: actions.removeFriend,
      onRemoveNotificationContact: backgroundDmAudio.removeContact,
      onRemoveMutedNick: actions.removeMutedNick,
      onSaveNickEmoji: actions.saveNickEmoji,
      onSelectNick: actions.selectPrivateBuffer,
    }),
    [
      actions.addFriend,
      actions.addMutedNick,
      actions.removeFriend,
      actions.removeMutedNick,
      actions.saveNickEmoji,
      actions.selectPrivateBuffer,
      backgroundDmAudio,
      friends,
      mutedNicks,
      nickEmojis,
      primeBackgroundDmAudio,
    ],
  );
}
