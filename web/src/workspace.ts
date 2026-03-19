import type { ChannelState, NetworkProfile, QueryBuffer } from '../../shared/protocol.js';
import { getConnectionInstances, getConnectionStatus } from './workspace-helpers.js';
import type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';

export type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';
export { canShowInstanceChildren, getConnectionLabel } from './workspace-helpers.js';

type WorkspaceInput = {
  networks: NetworkProfile[];
  channels: ChannelState[];
  queries: QueryBuffer[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
};

const serverSelection = (networkId: string): SelectedBuffer => ({
  networkId,
  target: 'server',
  channelId: null,
});

const isChannelTarget = (target: string) => /^[#&+!]/.test(target);

export const selectDefaultBuffer = (snapshot: Pick<WorkspaceInput, 'networks'>): SelectedBuffer | null => {
  const instance = getConnectionInstances(snapshot.networks)[0];
  return instance ? serverSelection(instance.id) : null;
};

export const deriveWorkspace = (input: WorkspaceInput): WorkspaceView => {
  const connectionInstances = getConnectionInstances(input.networks);
  if (connectionInstances.length === 0) {
    return {
      mode: 'empty',
      selection: null,
      connectionInstances,
      selectedNetwork: null,
      selectedRuntime: null,
      selectedChannel: null,
      selectedQuery: null,
      headerTitle: 'No active connection',
      headerSubtitle: '',
      statusLabel: 'Offline',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Open Network List to create or connect an instance.',
      showNicklist: false,
    };
  }

  const selectedNetwork =
    connectionInstances.find((network) => network.id === input.selection?.networkId) ?? connectionInstances[0];
  const selectedRuntime = input.networkStates[selectedNetwork.id] ?? null;
  const connectionStatus = getConnectionStatus(selectedRuntime);
  const selection =
    !input.selection || input.selection.networkId !== selectedNetwork.id || connectionStatus !== 'connected'
      ? serverSelection(selectedNetwork.id)
      : input.selection;

  const selectedChannel = selection.channelId
    ? input.channels.find((channel) => channel.id === selection.channelId && channel.networkId === selectedNetwork.id) ?? null
    : input.channels.find((channel) => channel.networkId === selectedNetwork.id && channel.name === selection.target) ?? null;
  const selectedQuery =
    selection.target !== 'server'
      ? input.queries.find((query) => query.networkId === selectedNetwork.id && query.target === selection.target) ?? null
      : null;

  if (connectionStatus === 'offline') {
    return {
      mode: 'server-offline',
      selection: serverSelection(selectedNetwork.id),
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedChannel: null,
      selectedQuery: null,
      headerTitle: selectedNetwork.name,
      headerSubtitle: '',
      statusLabel: 'Offline',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Reconnect to restore channels and private messages.',
      showNicklist: false,
    };
  }

  if (connectionStatus === 'connecting') {
    return {
      mode: 'server-connecting',
      selection: serverSelection(selectedNetwork.id),
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedChannel: null,
      selectedQuery: null,
      headerTitle: selectedNetwork.name,
      headerSubtitle: '',
      statusLabel: 'Connecting',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Waiting for the server connection to finish.',
      showNicklist: false,
    };
  }

  const connectedSubtitle = `${selectedRuntime?.nick ?? selectedNetwork.nick} @ ${selectedRuntime?.serverName ?? 'server'}`;

  if (selectedChannel) {
    return {
      mode: 'channel-connected',
      selection: { networkId: selectedNetwork.id, target: selectedChannel.name, channelId: selectedChannel.id },
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedChannel,
      selectedQuery: null,
      headerTitle: selectedChannel.name,
      headerSubtitle: connectedSubtitle,
      statusLabel: 'Connected',
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Wait for activity or send a message.',
      showNicklist: true,
    };
  }

  if (selectedQuery) {
    return {
      mode: 'query-connected',
      selection: { networkId: selectedNetwork.id, target: selectedQuery.target, channelId: null },
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedChannel: null,
      selectedQuery,
      headerTitle: selectedQuery.target,
      headerSubtitle: connectedSubtitle,
      statusLabel: 'Connected',
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Wait for a reply or send a message.',
      showNicklist: false,
    };
  }

  if (selection.target !== 'server' && isChannelTarget(selection.target)) {
    return {
      mode: 'channel-pending',
      selection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedChannel: null,
      selectedQuery: null,
      headerTitle: selection.target,
      headerSubtitle: connectedSubtitle,
      statusLabel: 'Connected',
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Waiting for the server to open this channel buffer.',
      showNicklist: false,
    };
  }

  return {
    mode: 'server-connected',
    selection: serverSelection(selectedNetwork.id),
    connectionInstances,
    selectedNetwork,
    selectedRuntime,
    selectedChannel: null,
    selectedQuery: null,
    headerTitle: selectedNetwork.name,
    headerSubtitle: connectedSubtitle,
    statusLabel: 'Connected',
    composerMode: 'commands',
    composerPlaceholder: 'Use /join #channel or another /command',
    emptyBody: 'Use /join #channel to enter a channel.',
    showNicklist: false,
  };
};
