import { useMemo } from 'react';
import { listSavedNetworks } from '../../shared/network-model.js';
import type { State } from './app-types.js';
import type { AppModel } from './app-model.js';
import { buildConnectionSidebarView } from './connection-sidebar-view.js';
import { buildConversationModel } from './conversation-model.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import { selectConversationMessages } from './conversation-selectors.js';
import { deriveWorkspace } from './workspace.js';
import { getConnectionInstances } from './workspace-helpers.js';

export function useAppDerivedState(state: State): AppModel {
  const conversation = useMemo(
    () => buildConversationModel({
      buffers: state.domain.buffers,
      channels: state.domain.channels,
      pendingChannels: state.domain.pendingChannels,
    }),
    [
      state.domain.buffers,
      state.domain.channels,
      state.domain.pendingChannels,
    ]
  );
  const connectionInstances = useMemo(
    () => getConnectionInstances(state.domain.networks),
    [state.domain.networks]
  );
  const workspace = useMemo(
    () => deriveWorkspace({
      networks: state.domain.networks,
      conversation,
      networkStates: state.domain.networkStates,
      selection: state.transient.selection,
    }),
    [
      state.domain.networkStates,
      state.domain.networks,
      state.transient.selection,
      conversation,
    ]
  );
  const managerNetworks = useMemo(
    () => listSavedNetworks(state.domain.networks),
    [state.domain.networks]
  );
  const visibleNetworks = useMemo(
    () => state.transient.networkManager.showFavoritesOnly
      ? managerNetworks.filter((network) => network.favorite)
      : managerNetworks,
    [managerNetworks, state.transient.networkManager.showFavoritesOnly]
  );
  const { hiddenManagedNetworkName, visibleManagedNetwork } = useMemo(() => {
    const managedNetwork = managerNetworks.find(
      (network) => network.id === state.transient.networkManager.managedNetworkId
    ) ?? null;
    const visibleManagedNetwork = visibleNetworks.find(
      (network) => network.id === state.transient.networkManager.managedNetworkId
    ) ?? null;

    return {
      hiddenManagedNetworkName:
        managedNetwork && !visibleManagedNetwork && state.transient.networkManager.showFavoritesOnly
          ? managedNetwork.name
          : null,
      visibleManagedNetwork,
    };
  }, [
    managerNetworks,
    state.transient.networkManager.managedNetworkId,
    state.transient.networkManager.showFavoritesOnly,
    visibleNetworks,
  ]);
  const channelListNetwork = useMemo(
    () => state.domain.networks.find((network) => network.id === state.transient.channelList.networkId) ?? null,
    [state.domain.networks, state.transient.channelList.networkId]
  );
  const managedRuntime = useMemo(
    () => buildManagedRuntime(visibleManagedNetwork, connectionInstances, state.domain.networkStates),
    [connectionInstances, state.domain.networkStates, visibleManagedNetwork]
  );
  const selectedMessages = useMemo(
    () => selectConversationMessages(state.domain.messages, workspace.selectedBuffer),
    [state.domain.messages, workspace.selectedBuffer]
  );
  const sidebarConnections = useMemo(
    () => buildConnectionSidebarView({
      networks: connectionInstances,
      conversation,
      networkStates: state.domain.networkStates,
      selection: workspace.selection,
    }),
    [connectionInstances, conversation, state.domain.networkStates, workspace.selection]
  );

  return useMemo(
    () => ({
      channelListNetwork,
      conversation,
      hiddenManagedNetworkName,
      managedRuntime,
      selectedMessages,
      sidebarConnections,
      visibleManagedNetwork,
      visibleNetworks,
      workspace,
    }),
    [
      channelListNetwork,
      conversation,
      hiddenManagedNetworkName,
      managedRuntime,
      selectedMessages,
      sidebarConnections,
      visibleManagedNetwork,
      visibleNetworks,
      workspace,
    ]
  );
}
