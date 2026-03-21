import { useMemo } from 'react';
import { isSavedNetwork } from '../../shared/network-model.js';
import type { State } from './app-types.js';
import { createConversationQueries } from './conversation-selectors.js';
import { buildConnectionSidebarView } from './connection-sidebar-view.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import { deriveWorkspace } from './workspace.js';

export function useAppDerivedState(
  state: State,
  showFavoritesOnly: boolean,
  managedNetworkId: string | null,
) {
  const workspace = useMemo(
    () =>
      deriveWorkspace({
        networks: state.networks,
        buffers: state.buffers,
        channels: state.channels,
        pendingChannels: state.pendingChannels,
        networkStates: state.networkStates,
        selection: state.selection,
      }),
    [state.buffers, state.channels, state.networkStates, state.networks, state.pendingChannels, state.selection]
  );
  const conversation = useMemo(
    () => createConversationQueries(state),
    [state.buffers, state.channels, state.messages, state.pendingChannels]
  );
  const managerNetworks = useMemo(() => state.networks.filter(isSavedNetwork), [state.networks]);
  const visibleNetworks = useMemo(
    () => (showFavoritesOnly ? managerNetworks.filter((network) => network.favorite) : managerNetworks),
    [managerNetworks, showFavoritesOnly]
  );
  const managedNetwork = managerNetworks.find((network) => network.id === managedNetworkId) ?? null;
  const visibleManagedNetwork = visibleNetworks.find((network) => network.id === managedNetworkId) ?? null;
  const hiddenManagedNetworkName =
    managedNetwork && !visibleManagedNetwork && showFavoritesOnly ? managedNetwork.name : null;
  const managedRuntime = useMemo(
    () => buildManagedRuntime(visibleManagedNetwork, workspace.connectionInstances, state.networkStates),
    [state.networkStates, visibleManagedNetwork, workspace.connectionInstances]
  );
  const channelListNetwork = state.networks.find((network) => network.id === state.channelList.networkId) ?? null;
  const selectedMessages = useMemo(
    () => conversation.selectMessages(workspace.selectedBuffer),
    [conversation, workspace.selectedBuffer]
  );
  const sidebarConnections = useMemo(
    () =>
      buildConnectionSidebarView({
        networks: workspace.connectionInstances,
        buffers: state.buffers,
        pendingChannels: state.pendingChannels,
        networkStates: state.networkStates,
        selection: workspace.selection,
      }),
    [state.buffers, state.networkStates, state.pendingChannels, workspace.connectionInstances, workspace.selection]
  );

  return {
    channelListNetwork,
    hiddenManagedNetworkName,
    managedRuntime,
    selectedMessages,
    sidebarConnections,
    visibleManagedNetwork,
    visibleNetworks,
    workspace,
  };
}
