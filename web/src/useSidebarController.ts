import type { State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppActions } from './useAppActions.js';
import type { useAppDerivedState } from './useAppDerivedState.js';

type SidebarControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  derived: ReturnType<typeof useAppDerivedState>;
  state: State;
};

export function useSidebarController({
  actions,
  derived,
  state,
}: SidebarControllerParams): DesktopShellProps['sidebar'] {
  return {
    connections: derived.sidebarConnections,
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
  };
}
