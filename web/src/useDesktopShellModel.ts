import { useMemo } from 'react';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppUiState } from './useAppUiState.js';
import type {
  NicklistActionSet,
  SidebarActionSet,
} from './useAppActions.js';
import {
  useDesktopChatModel,
  type DesktopChatModelParams,
} from './useDesktopChatModel.js';
export { useDesktopChatModel } from './useDesktopChatModel.js';

type DesktopHeaderModelParams = {
  dispatch: (action: Action) => void;
  ui: Pick<
    AppUiState,
    'messageDisplayMode' | 'openPreferences' | 'setMessageDisplayMode'
  >;
};

type DesktopSidebarModelParams = {
  actions: SidebarActionSet;
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  queryPresence: State['domain']['queryPresence'];
  sidebarConnections: ConnectionSidebarProps['connections'];
};

type DesktopNicklistModelParams = {
  actions: NicklistActionSet;
  friends: State['domain']['friends'];
  mutedNicks: State['domain']['mutedNicks'];
};

export function useDesktopHeaderModel({
  dispatch,
  ui,
}: DesktopHeaderModelParams): DesktopShellModel['header'] {
  return useMemo(
    () => ({
      messageDisplayMode: ui.messageDisplayMode,
      showMessageDisplayModeToggle: import.meta.env.DEV,
      onMessageDisplayModeChange: ui.setMessageDisplayMode,
      onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
      onOpenPreferences: ui.openPreferences,
    }),
    [
      dispatch,
      ui.messageDisplayMode,
      ui.openPreferences,
      ui.setMessageDisplayMode,
    ],
  );
}

export function useDesktopSidebarModel({
  actions,
  friends,
  friendPresence,
  queryPresence,
  sidebarConnections,
}: DesktopSidebarModelParams): DesktopShellModel['sidebar'] {
  return useMemo(
    () => ({
      connections: sidebarConnections,
      friends,
      friendPresence,
      queryPresence,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      onSelectFriend: actions.selectFriend,
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
      queryPresence,
      sidebarConnections,
    ],
  );
}

export function useDesktopNicklistModel({
  actions,
  friends,
  mutedNicks,
}: DesktopNicklistModelParams): DesktopShellModel['nicklist'] {
  return useMemo(
    () => ({
      friends,
      mutedNicks,
      onAddFriend: actions.addFriend,
      onAddMutedNick: actions.addMutedNick,
      onRemoveFriend: actions.removeFriend,
      onRemoveMutedNick: actions.removeMutedNick,
      onSelectNick: actions.selectPrivateBuffer,
    }),
    [
      actions.addFriend,
      actions.addMutedNick,
      actions.removeFriend,
      actions.removeMutedNick,
      actions.selectPrivateBuffer,
      friends,
      mutedNicks,
    ],
  );
}
