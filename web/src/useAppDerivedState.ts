import { useMemo } from 'react';
import { listSavedNetworks } from '../../shared/network-model.js';
import type { State } from './app-types.js';
import { buildConnectionSidebarView } from './connection-sidebar-view.js';
import { buildConversationModel, type ConversationModel } from './conversation-model.js';
import { selectConversationMessages } from './conversation-selectors.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import type { WorkspaceView } from './workspace-types.js';
import { deriveWorkspace } from './workspace.js';
import { getConnectionInstances } from './workspace-helpers.js';

export function useConversationModel(state: State) {
  return useMemo(
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
}

export function useConnectionInstances(networks: State['domain']['networks']) {
  return useMemo(() => getConnectionInstances(networks), [networks]);
}

export function useWorkspaceView(state: State, conversation: ConversationModel) {
  return useMemo(
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
}

export function useSavedNetworks(networks: State['domain']['networks']) {
  return useMemo(() => listSavedNetworks(networks), [networks]);
}

export function useVisibleNetworks(
  savedNetworks: State['domain']['networks'],
  showFavoritesOnly: boolean,
) {
  return useMemo(
    () => showFavoritesOnly
      ? savedNetworks.filter((network) => network.favorite)
      : savedNetworks,
    [savedNetworks, showFavoritesOnly]
  );
}

type ManagedNetworkModelParams = {
  connectionInstances: State['domain']['networks'];
  networkManager: State['transient']['networkManager'];
  networkStates: State['domain']['networkStates'];
  savedNetworks: State['domain']['networks'];
  visibleNetworks: State['domain']['networks'];
};

export function useManagedNetworkModel({
  connectionInstances,
  networkManager,
  networkStates,
  savedNetworks,
  visibleNetworks,
}: ManagedNetworkModelParams) {
  const { hiddenManagedNetworkName, visibleManagedNetwork } = useMemo(() => {
    const managedNetwork = savedNetworks.find(
      (network) => network.id === networkManager.managedNetworkId
    ) ?? null;
    const visibleManaged = visibleNetworks.find(
      (network) => network.id === networkManager.managedNetworkId
    ) ?? null;

    return {
      hiddenManagedNetworkName:
        managedNetwork && !visibleManaged && networkManager.showFavoritesOnly
          ? managedNetwork.name
          : null,
      visibleManagedNetwork: visibleManaged,
    };
  }, [
    networkManager.managedNetworkId,
    networkManager.showFavoritesOnly,
    savedNetworks,
    visibleNetworks,
  ]);

  const managedRuntime = useMemo(
    () => buildManagedRuntime(visibleManagedNetwork, connectionInstances, networkStates),
    [connectionInstances, networkStates, visibleManagedNetwork]
  );

  return {
    hiddenManagedNetworkName,
    managedRuntime,
    visibleManagedNetwork,
  };
}

export function useChannelListNetwork(
  networks: State['domain']['networks'],
  networkId: string | null,
) {
  return useMemo(
    () => networks.find((network) => network.id === networkId) ?? null,
    [networkId, networks]
  );
}

export function useSelectedMessages(
  messages: State['domain']['messages'],
  selectedBuffer: WorkspaceView['selectedBuffer'],
) {
  return useMemo(
    () => selectConversationMessages(messages, selectedBuffer),
    [messages, selectedBuffer]
  );
}

export function useSidebarConnections(
  connectionInstances: State['domain']['networks'],
  conversation: ConversationModel,
  networkStates: State['domain']['networkStates'],
  selection: WorkspaceView['selection'],
) {
  return useMemo(
    () => buildConnectionSidebarView({
      networks: connectionInstances,
      conversation,
      networkStates,
      selection,
    }),
    [connectionInstances, conversation, networkStates, selection]
  );
}
