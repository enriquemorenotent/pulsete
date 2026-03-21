import { useMemo } from 'react';
import type { AppModel } from './app-model.js';
import type { State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppActions } from './useAppActions.js';

type SidebarControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  model: AppModel;
  state: State;
};

export function useSidebarController({
  actions,
  model,
  state,
}: SidebarControllerParams): DesktopShellProps['sidebar'] {
  return useMemo(() => ({
    connections: model.sidebarConnections,
    friends: state.domain.friends,
    friendPresence: state.domain.friendPresence,
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
  }), [
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
    model.sidebarConnections,
    state.domain.friendPresence,
    state.domain.friends,
  ]);
}
