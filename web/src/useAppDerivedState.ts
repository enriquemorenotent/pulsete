import { useMemo } from 'react';
import { isSavedNetwork } from '../../shared/network-model.js';
import type { State } from './app-types.js';
import type { ConversationIndex } from './conversation-selectors.js';
import { buildConnectionSidebarView } from './connection-sidebar-view.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import { deriveWorkspace } from './workspace.js';

export function useAppDerivedState(
  state: State,
  conversation: ConversationIndex,
  showFavoritesOnly: boolean,
  managedNetworkId: string | null,
) {
  const workspace = useMemo(
    () =>
      deriveWorkspace({
        networks: state.domain.networks,
        conversation,
        networkStates: state.domain.networkStates,
        selection: state.transient.selection,
      }),
    [conversation, state.domain.networkStates, state.domain.networks, state.transient.selection]
  );
  const managerNetworks = useMemo(() => state.domain.networks.filter(isSavedNetwork), [state.domain.networks]);
  const visibleNetworks = useMemo(
    () => (showFavoritesOnly ? managerNetworks.filter((network) => network.favorite) : managerNetworks),
    [managerNetworks, showFavoritesOnly]
  );
  const managedNetwork = managerNetworks.find((network) => network.id === managedNetworkId) ?? null;
  const visibleManagedNetwork = visibleNetworks.find((network) => network.id === managedNetworkId) ?? null;
  const hiddenManagedNetworkName =
    managedNetwork && !visibleManagedNetwork && showFavoritesOnly ? managedNetwork.name : null;
  const managedRuntime = useMemo(
    () => buildManagedRuntime(visibleManagedNetwork, workspace.connectionInstances, state.domain.networkStates),
    [state.domain.networkStates, visibleManagedNetwork, workspace.connectionInstances]
  );
  const channelListNetwork =
    state.domain.networks.find((network) => network.id === state.transient.channelList.networkId) ?? null;
  const selectedMessages = useMemo(
    () => conversation.selectMessages(workspace.selectedBuffer),
    [conversation, workspace.selectedBuffer]
  );
  const sidebarConnections = useMemo(
    () =>
      buildConnectionSidebarView({
        networks: workspace.connectionInstances,
        conversation,
        networkStates: state.domain.networkStates,
        selection: workspace.selection,
      }),
    [conversation, state.domain.networkStates, workspace.connectionInstances, workspace.selection]
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
