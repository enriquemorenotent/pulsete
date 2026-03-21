import type { AppSnapshot, BufferState, ChannelState, NetworkProfile, PendingChannelState } from '../../shared/protocol.js';
import { createConversationQueries } from './conversation-selectors.js';
import { getConnectionInstances, getConnectionStatus } from './workspace-helpers.js';
import type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';

export type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';
export { getConnectionStatus, getConnectionLabel, getConnectionLabelParts } from './workspace-helpers.js';

type WorkspaceInput = {
  networks: NetworkProfile[];
  buffers: BufferState[];
  channels: ChannelState[];
  pendingChannels: PendingChannelState[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
};

const selectionFor = (buffer: BufferState | null): SelectedBuffer | null =>
  buffer ? { kind: 'buffer', bufferId: buffer.id } : null;

const getReadOnlySubtitle = (status: 'offline' | 'connecting') =>
  status === 'offline'
    ? 'Offline. History only until you reconnect.'
    : 'Reconnecting. History stays available until the connection returns.';

const getReadOnlyEmptyBody = (
  kind: Extract<BufferState['kind'], 'channel' | 'query'>,
  status: 'offline' | 'connecting'
) => {
  const prefix =
    kind === 'channel'
      ? 'No saved channel history yet.'
      : 'No saved private-message history yet.';
  const suffix =
    status === 'offline'
      ? 'Reconnect to resume the conversation.'
      : 'Wait for the connection to finish to resume the conversation.';
  return `${prefix} ${suffix}`;
};

export const selectDefaultBuffer = (snapshot: Pick<AppSnapshot, 'networks' | 'buffers'>): SelectedBuffer | null => {
  const instance = getConnectionInstances(snapshot.networks)[0];
  const queries = createConversationQueries({
    buffers: snapshot.buffers,
    channels: [],
    pendingChannels: [],
    messages: [],
  });
  return selectionFor(instance ? queries.findServerBuffer(instance.id) : null);
};

export const deriveWorkspace = (input: WorkspaceInput): WorkspaceView => {
  const queries = createConversationQueries({ ...input, messages: [] });
  const connectionInstances = getConnectionInstances(input.networks);
  if (connectionInstances.length === 0) {
    return {
      mode: 'empty',
      selection: null,
      connectionInstances,
      selectedNetwork: null,
      selectedRuntime: null,
      selectedBuffer: null,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: 'No active connection',
      headerSubtitle: '',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Open Network Manager to create or connect an instance.',
      showNicklist: false,
    };
  }

  const selectedBuffer = queries.findSelectedBuffer(input.selection);
  const selectedPendingChannel = queries.findSelectedPendingChannel(input.selection);
  const selectedNetwork =
    connectionInstances.find(
      (network) => network.id === selectedBuffer?.networkId || network.id === selectedPendingChannel?.networkId
    ) ?? connectionInstances[0];
  const selectedRuntime = input.networkStates[selectedNetwork.id] ?? null;
  const connectionStatus = getConnectionStatus(selectedRuntime);
  const serverBuffer = queries.findServerBuffer(selectedNetwork.id);
  const activeBuffer =
    !selectedBuffer || selectedBuffer.networkId !== selectedNetwork.id ? serverBuffer : selectedBuffer;
  const activeSelection = selectionFor(activeBuffer);
  const activePendingChannel =
    selectedPendingChannel && selectedPendingChannel.networkId === selectedNetwork.id ? selectedPendingChannel : null;
  const connectedSubtitle = `${selectedRuntime?.nick ?? selectedNetwork.nick} @ ${selectedRuntime?.serverName ?? 'server'}`;

  if (!serverBuffer) {
    return {
      mode: connectionStatus === 'connected' ? 'server-connected' : connectionStatus === 'connecting' ? 'server-connecting' : 'server-offline',
      selection: null,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: null,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: '',
      headerSubtitle: connectionStatus === 'connected' ? connectedSubtitle : '',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody:
        connectionStatus === 'connected'
          ? 'Loading the server buffer for this connection.'
          : connectionStatus === 'connecting'
            ? 'Starting the connection view. Wait for the server buffer to load.'
            : 'Restoring the server buffer for this connection.',
      showNicklist: false,
    };
  }

  const selectedChannel = queries.findChannelByBuffer(activeBuffer);

  if (activePendingChannel) {
    return {
      mode: 'channel-pending',
      selection: input.selection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: null,
      selectedChannel: null,
      selectedPendingChannel: activePendingChannel,
      headerTitle: activePendingChannel.channel,
      headerSubtitle:
        connectionStatus === 'connected'
          ? connectedSubtitle
          : 'Waiting for the connection to become available again.',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Joining channel. Wait for the server to confirm the membership.',
      showNicklist: false,
    };
  }

  if (connectionStatus === 'offline' && activeBuffer?.kind === 'channel') {
    return {
      mode: 'channel-offline',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel,
      selectedPendingChannel: null,
      headerTitle: selectedChannel?.name ?? activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('offline'),
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: getReadOnlyEmptyBody('channel', 'offline'),
      showNicklist: false,
    };
  }

  if (connectionStatus === 'offline' && activeBuffer?.kind === 'query') {
    return {
      mode: 'query-offline',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('offline'),
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: getReadOnlyEmptyBody('query', 'offline'),
      showNicklist: false,
    };
  }

  if (connectionStatus === 'offline') {
    return {
      mode: 'server-offline',
      selection: selectionFor(serverBuffer),
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: serverBuffer,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: '',
      headerSubtitle: '',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Reconnect to restore channels and private messages.',
      showNicklist: false,
    };
  }

  if (connectionStatus === 'connecting' && activeBuffer?.kind === 'channel') {
    return {
      mode: 'channel-connecting',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel,
      selectedPendingChannel: null,
      headerTitle: selectedChannel?.name ?? activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('connecting'),
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: getReadOnlyEmptyBody('channel', 'connecting'),
      showNicklist: false,
    };
  }

  if (connectionStatus === 'connecting' && activeBuffer?.kind === 'query') {
    return {
      mode: 'query-connecting',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('connecting'),
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: getReadOnlyEmptyBody('query', 'connecting'),
      showNicklist: false,
    };
  }

  if (connectionStatus === 'connecting') {
    return {
      mode: 'server-connecting',
      selection: selectionFor(serverBuffer),
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: serverBuffer,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: '',
      headerSubtitle: '',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Waiting for the server connection to finish.',
      showNicklist: false,
    };
  }

  if (activeBuffer?.kind === 'channel' && selectedChannel) {
    return {
      mode: 'channel-connected',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel,
      selectedPendingChannel: null,
      headerTitle: selectedChannel.name,
      headerSubtitle: connectedSubtitle,
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Wait for activity or send a message.',
      showNicklist: true,
    };
  }

  if (activeBuffer?.kind === 'query') {
    return {
      mode: 'query-connected',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: activeBuffer.target,
      headerSubtitle: connectedSubtitle,
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Wait for a reply or send a message.',
      showNicklist: false,
    };
  }

  if (activeBuffer?.kind === 'channel') {
    return {
      mode: 'channel-offline',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel: null,
      selectedPendingChannel: null,
      headerTitle: activeBuffer.target,
      headerSubtitle: 'Not joined. History stays available until you rejoin this channel.',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Use /join to re-enter this channel before sending messages.',
      showNicklist: false,
    };
  }

  return {
    mode: 'server-connected',
    selection: selectionFor(serverBuffer),
    connectionInstances,
    selectedNetwork,
    selectedRuntime,
    selectedBuffer: serverBuffer,
    selectedChannel: null,
    selectedPendingChannel: null,
    headerTitle: '',
    headerSubtitle: connectedSubtitle,
    composerMode: 'commands',
    composerPlaceholder: 'Use /join #channel or another /command',
    emptyBody: 'Use /join #channel to enter a channel.',
    showNicklist: false,
  };
};
