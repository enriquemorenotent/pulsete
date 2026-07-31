import { listSavedNetworks, listWorkspaceNetworks } from '../../shared/network-model.js';
import type { NetworkProfile } from '../../shared/protocol-chat.js';
import { buildConnectionSidebarView } from './connection-sidebar-view.js';
import { buildConversationModel } from './conversation-model.js';
import { selectConversationMessages } from './conversation-selectors.js';
import { buildManagedRuntime, buildManagedRuntimeMap } from './network-manager-runtime.js';
import type { State } from './app-types.js';
import { deriveWorkspace } from './workspace.js';

const memoizeLast = <Args extends readonly unknown[], Result>(
  compute: (...args: Args) => Result,
) => {
  let previousArgs: Args | null = null;
  let previousResult: Result;
  return (...args: Args) => {
    const currentArgs = previousArgs;
    const argsMatch = currentArgs !== null
      && currentArgs.length === args.length
      && args.every((value, index) => Object.is(value, currentArgs[index]));
    if (argsMatch) {
      return previousResult;
    }
    previousArgs = args;
    previousResult = compute(...args);
    return previousResult;
  };
};

const buildConversation = memoizeLast(
  (
    buffers: State['domain']['buffers'],
    channels: State['domain']['channels'],
    pendingChannels: State['domain']['pendingChannels'],
  ) =>
    buildConversationModel({
      buffers,
      channels,
      pendingChannels,
    }),
);

const buildWorkspace = memoizeLast(
  (
    networks: State['domain']['networks'],
    networkStates: State['domain']['networkStates'],
    selection: State['transient']['selection'],
    conversation: ReturnType<typeof selectConversation>,
  ) =>
    deriveWorkspace({
      networks,
      conversation,
      networkStates,
      selection,
    }),
);

const buildVisibleNetworks = memoizeLast(
  (savedNetworks: NetworkProfile[], showFavoritesOnly: boolean) =>
    showFavoritesOnly
      ? savedNetworks.filter((network) => network.favorite)
      : savedNetworks,
);

const buildWorkspaceNetworks = memoizeLast(
  (networks: State['domain']['networks']) => listWorkspaceNetworks(networks),
);

const buildSavedNetworks = memoizeLast(
  (networks: State['domain']['networks']) => listSavedNetworks(networks),
);

const buildManagedNetworkModel = memoizeLast(
  (
    managedNetworkId: string | null,
    networkStates: State['domain']['networkStates'],
    visibleNetworks: NetworkProfile[],
  ) => {
    const visibleManagedNetwork =
      visibleNetworks.find((network) => network.id === managedNetworkId) ?? null;
    return {
      managedRuntime: buildManagedRuntime(visibleManagedNetwork, networkStates),
      managedRuntimes: buildManagedRuntimeMap(visibleNetworks, networkStates),
      visibleManagedNetwork,
    };
  },
);

const buildNetworkNamesById = memoizeLast(
  (networks: State['domain']['networks']) =>
    new Map(networks.map((network) => [network.id, network.name])),
);

const buildSelectedMessages = memoizeLast(
  (
    messages: State['domain']['messages'],
    selectedBuffer: ReturnType<typeof selectWorkspace>['selectedBuffer'],
  ) => selectConversationMessages(messages, selectedBuffer),
);

const buildSidebarConnections = memoizeLast(
  (
    workspaceNetworks: State['domain']['networks'],
    conversation: ReturnType<typeof selectConversation>,
    networkStates: State['domain']['networkStates'],
    selection: ReturnType<typeof selectWorkspace>['selection'],
  ) =>
    buildConnectionSidebarView({
      networks: workspaceNetworks,
      conversation,
      networkStates,
      selection,
    }),
);

const buildServerProfileNetwork = memoizeLast(
  (
    selectedNetwork: ReturnType<typeof selectWorkspace>['selectedNetwork'],
  ) => {
    return selectedNetwork;
  },
);

export const selectPhase = (state: State) => state.domain.phase;
export const selectBanner = (state: State) => state.transient.banner;
export const selectGatewayStatus = (state: State) => state.domain.gatewayStatus;
export const selectNetworks = (state: State) => state.domain.networks;
export const selectBuffers = (state: State) => state.domain.buffers;
export const selectMessagesByConversation = (state: State) => state.domain.messages;
export const selectChannels = (state: State) => state.domain.channels;
export const selectFriends = (state: State) => state.domain.friends;
export const selectMutedNicks = (state: State) => state.domain.mutedNicks;
export const selectNickEmojis = (state: State) => state.domain.nickEmojis;
export const selectPreferences = (state: State) => state.domain.preferences;
export const selectUserAvatarOverrides = (state: State) => state.domain.userAvatarOverrides;
export const selectDrafts = (state: State) => state.domain.drafts;
export const selectBrowserStorageImportPending = (state: State) =>
  state.domain.browserStorageImportPending;
export const selectFriendPresence = (state: State) => state.domain.friendPresence;
export const selectQueryPresence = (state: State) => state.domain.queryPresence;
export const selectChannelList = (state: State) => state.transient.channelList;
export const selectNetworkManagerState = (state: State) => state.transient.networkManager;
export const selectHistoryLoadedByBufferId = (state: State) =>
  state.transient.historyLoadedByBufferId;
export const selectHistoryHasOlderByBufferId = (state: State) =>
  state.transient.historyHasOlderByBufferId;

export const selectConversation = (state: State) =>
  buildConversation(
    state.domain.buffers,
    state.domain.channels,
    state.domain.pendingChannels,
  );

export const selectWorkspaceNetworks = (state: State) =>
  buildWorkspaceNetworks(state.domain.networks);

export const selectWorkspace = (state: State) =>
  buildWorkspace(
    state.domain.networks,
    state.domain.networkStates,
    state.transient.selection,
    selectConversation(state),
  );

export const selectSavedNetworks = (state: State) =>
  buildSavedNetworks(state.domain.networks);

export const selectVisibleNetworks = (state: State) =>
  buildVisibleNetworks(
    selectSavedNetworks(state),
    state.transient.networkManager.showFavoritesOnly,
  );

export const selectManagedNetworkModel = (state: State) =>
  buildManagedNetworkModel(
    state.transient.networkManager.managedNetworkId,
    state.domain.networkStates,
    selectVisibleNetworks(state),
  );

export const selectChannelListNetwork = (state: State) =>
  state.domain.networks.find(
    (network) => network.id === state.transient.channelList.networkId,
  ) ?? null;

export const selectSelectedMessages = (state: State) =>
  buildSelectedMessages(state.domain.messages, selectWorkspace(state).selectedBuffer);

export const selectSidebarConnections = (state: State) =>
  buildSidebarConnections(
    selectWorkspaceNetworks(state),
    selectConversation(state),
    state.domain.networkStates,
    selectWorkspace(state).selection,
  );

export const selectSelectedBufferId = (state: State) =>
  selectWorkspace(state).selectedBuffer?.id ?? null;

export const selectRightSidebarKind = (state: State) => {
  const kind = selectWorkspace(state).selectedBuffer?.kind;
  return kind === 'server' ? 'profile' : kind === 'channel' ? 'users' : kind === 'query' ? 'notes' : null;
};

export const selectNetworkNamesById = (state: State) =>
  buildNetworkNamesById(state.domain.networks);

export const selectWorkspaceNetworkCount = (state: State) =>
  selectWorkspaceNetworks(state).length;

export const selectServerProfileNetwork = (state: State) =>
  buildServerProfileNetwork(selectWorkspace(state).selectedNetwork);
