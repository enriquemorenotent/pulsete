import { useMemo } from 'react';
import type { AppModel } from './app-model.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { State } from './app-types.js';
import type { SidebarActionSet } from './useAppActions.js';

type SidebarControllerParams = {
  actions: SidebarActionSet;
  connections: AppModel['sidebarConnections'];
  friendPresence: State['domain']['friendPresence'];
  friends: State['domain']['friends'];
};

export function useSidebarController({
  actions,
  connections,
  friendPresence,
  friends,
}: SidebarControllerParams): DesktopShellModel['sidebar'] {
  return useMemo(() => ({
    connections,
    friends,
    friendPresence,
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
    connections,
    friendPresence,
    friends,
  ]);
}
