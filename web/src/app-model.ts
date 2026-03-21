import { listSavedNetworks } from '../../shared/network-model.js';
import type { NetworkProfile } from '../../shared/protocol.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import { buildConnectionSidebarView, type SidebarConnectionView } from './connection-sidebar-view.js';
import { buildConversationModel, type ConversationModel } from './conversation-model.js';
import { buildManagedRuntime } from './network-manager-runtime.js';
import { deriveWorkspace } from './workspace.js';
import type { WorkspaceView } from './workspace-types.js';

type AppModelState = Pick<
  AppDomainState,
  'networks' | 'buffers' | 'channels' | 'pendingChannels' | 'messages' | 'networkStates'
> & {
  channelListNetworkId: string | null;
  managedNetworkId: string | null;
  selection: AppTransientState['selection'];
  showFavoritesOnly: boolean;
};

export type AppModel = {
  channelListNetwork: NetworkProfile | null;
  conversation: ConversationModel;
  hiddenManagedNetworkName: string | null;
  managedRuntime: ReturnType<typeof buildManagedRuntime>;
  selectedMessages: ReturnType<ConversationModel['selectMessages']>;
  sidebarConnections: SidebarConnectionView[];
  visibleManagedNetwork: NetworkProfile | null;
  visibleNetworks: NetworkProfile[];
  workspace: WorkspaceView;
};

export const buildAppModel = (state: AppModelState): AppModel => {
  const conversation = buildConversationModel(state);
  const workspace = deriveWorkspace({
    networks: state.networks,
    conversation,
    networkStates: state.networkStates,
    selection: state.selection,
  });
  const managerNetworks = listSavedNetworks(state.networks);
  const visibleNetworks = state.showFavoritesOnly
    ? managerNetworks.filter((network) => network.favorite)
    : managerNetworks;
  const visibleManagedNetwork = visibleNetworks.find((network) => network.id === state.managedNetworkId) ?? null;
  const managedNetwork = managerNetworks.find((network) => network.id === state.managedNetworkId) ?? null;
  const hiddenManagedNetworkName =
    managedNetwork && !visibleManagedNetwork && state.showFavoritesOnly ? managedNetwork.name : null;

  return {
    channelListNetwork:
      state.networks.find((network) => network.id === state.channelListNetworkId) ?? null,
    conversation,
    hiddenManagedNetworkName,
    managedRuntime: buildManagedRuntime(visibleManagedNetwork, workspace.connectionInstances, state.networkStates),
    selectedMessages: conversation.selectMessages(workspace.selectedBuffer),
    sidebarConnections: buildConnectionSidebarView({
      networks: workspace.connectionInstances,
      conversation,
      networkStates: state.networkStates,
      selection: workspace.selection,
    }),
    visibleManagedNetwork,
    visibleNetworks,
    workspace,
  };
};
