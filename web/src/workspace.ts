import type { AppSnapshot, BufferState, ChannelState, NetworkProfile, PendingChannelState } from '../../shared/protocol.js';
import { createConversationQueries } from './conversation-selectors.js';
import { getConnectionInstances, getConnectionStatus } from './workspace-helpers.js';
import type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';

export type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';
export { getConnectionStatus, getConnectionLabel, getConnectionLabelParts, type ConnectionLabelParts } from './workspace-helpers.js';

type WorkspaceInput = {
  networks: NetworkProfile[];
  buffers: BufferState[];
  channels: ChannelState[];
  pendingChannels: PendingChannelState[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
};

type ResolvedWorkspace = {
  connectionInstances: NetworkProfile[];
  selectedNetwork: NetworkProfile;
  selectedRuntime: NetworkRuntimeState | null;
  selectedBuffer: BufferState | null;
  selectedPendingChannel: PendingChannelState | null;
  activeBuffer: BufferState | null;
  activeSelection: SelectedBuffer | null;
  activePendingChannel: PendingChannelState | null;
  selectedChannel: ChannelState | null;
  serverBuffer: BufferState | null;
  connectedSubtitle: string;
  connectionStatus: NetworkRuntimeState['phase'];
  inputSelection: SelectedBuffer | null;
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
  const resolved = resolveWorkspace(input);
  return resolved ? buildResolvedWorkspace(resolved) : buildEmptyWorkspace(getConnectionInstances(input.networks));
};

const resolveWorkspace = (input: WorkspaceInput): ResolvedWorkspace | null => {
  const connectionInstances = getConnectionInstances(input.networks);
  if (connectionInstances.length === 0) {
    return null;
  }

  const queries = createConversationQueries({ ...input, messages: [] });
  const selectedBuffer = queries.findSelectedBuffer(input.selection);
  const selectedPendingChannel = queries.findSelectedPendingChannel(input.selection);
  const selectedNetwork =
    connectionInstances.find(
      (network) => network.id === selectedBuffer?.networkId || network.id === selectedPendingChannel?.networkId
    ) ?? connectionInstances[0];
  const selectedRuntime = input.networkStates[selectedNetwork.id] ?? null;
  const serverBuffer = queries.findServerBuffer(selectedNetwork.id);
  const activeBuffer =
    !selectedBuffer || selectedBuffer.networkId !== selectedNetwork.id ? serverBuffer : selectedBuffer;
  const activePendingChannel =
    selectedPendingChannel && selectedPendingChannel.networkId === selectedNetwork.id ? selectedPendingChannel : null;

  return {
    connectionInstances,
    selectedNetwork,
    selectedRuntime,
    selectedBuffer,
    selectedPendingChannel,
    activeBuffer,
    activeSelection: selectionFor(activeBuffer),
    activePendingChannel,
    selectedChannel: activeBuffer ? queries.findChannelByBuffer(activeBuffer) : null,
    serverBuffer,
    connectedSubtitle: `${selectedRuntime?.nick ?? selectedNetwork.nick} @ ${selectedRuntime?.serverName ?? 'server'}`,
    connectionStatus: getConnectionStatus(selectedRuntime),
    inputSelection: input.selection,
  };
};

const buildResolvedWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (!resolved.serverBuffer) {
    return buildServerBufferTransition(resolved);
  }

  if (resolved.activePendingChannel) {
    return buildPendingChannelWorkspace(resolved);
  }

  if (resolved.connectionStatus === 'offline') {
    return buildOfflineWorkspace(resolved);
  }

  if (resolved.connectionStatus === 'connecting') {
    return buildConnectingWorkspace(resolved);
  }

  return buildConnectedWorkspace(resolved);
};

const buildEmptyWorkspace = (connectionInstances: NetworkProfile[]): WorkspaceView => ({
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
});

const createWorkspace = (
  resolved: ResolvedWorkspace,
  overrides: Partial<WorkspaceView> & Pick<WorkspaceView, 'mode'>
): WorkspaceView => ({
  selection: resolved.activeSelection,
  connectionInstances: resolved.connectionInstances,
  selectedNetwork: resolved.selectedNetwork,
  selectedRuntime: resolved.selectedRuntime,
  selectedBuffer: resolved.activeBuffer,
  selectedChannel: resolved.selectedChannel,
  selectedPendingChannel: null,
  headerTitle: '',
  headerSubtitle: '',
  composerMode: 'hidden',
  composerPlaceholder: '',
  emptyBody: '',
  showNicklist: false,
  ...overrides,
});

const buildServerBufferTransition = (resolved: ResolvedWorkspace): WorkspaceView =>
  createWorkspace(resolved, {
    mode:
      resolved.connectionStatus === 'connected'
        ? 'server-connected'
        : resolved.connectionStatus === 'connecting'
          ? 'server-connecting'
          : 'server-offline',
    selection: null,
    selectedBuffer: null,
    selectedChannel: null,
    headerSubtitle: resolved.connectionStatus === 'connected' ? resolved.connectedSubtitle : '',
    emptyBody:
      resolved.connectionStatus === 'connected'
        ? 'Loading the server buffer for this connection.'
        : resolved.connectionStatus === 'connecting'
          ? 'Starting the connection view. Wait for the server buffer to load.'
          : 'Restoring the server buffer for this connection.',
  });

const buildPendingChannelWorkspace = (resolved: ResolvedWorkspace): WorkspaceView =>
  createWorkspace(resolved, {
    mode: 'channel-pending',
    selection: resolved.inputSelection,
    selectedBuffer: null,
    selectedChannel: null,
    selectedPendingChannel: resolved.activePendingChannel,
    headerTitle: resolved.activePendingChannel?.channel ?? '',
    headerSubtitle:
      resolved.connectionStatus === 'connected'
        ? resolved.connectedSubtitle
        : 'Waiting for the connection to become available again.',
    emptyBody: 'Joining channel. Wait for the server to confirm the membership.',
  });

const buildOfflineWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (resolved.activeBuffer?.kind === 'channel') {
    return createWorkspace(resolved, {
      mode: 'channel-offline',
      headerTitle: resolved.selectedChannel?.name ?? resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('offline'),
      emptyBody: getReadOnlyEmptyBody('channel', 'offline'),
    });
  }

  if (resolved.activeBuffer?.kind === 'query') {
    return createWorkspace(resolved, {
      mode: 'query-offline',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('offline'),
      emptyBody: getReadOnlyEmptyBody('query', 'offline'),
    });
  }

  return createWorkspace(resolved, {
    mode: 'server-offline',
    selection: selectionFor(resolved.serverBuffer),
    selectedBuffer: resolved.serverBuffer,
    emptyBody: 'Reconnect to restore channels and private messages.',
  });
};

const buildConnectingWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (resolved.activeBuffer?.kind === 'channel') {
    return createWorkspace(resolved, {
      mode: 'channel-connecting',
      headerTitle: resolved.selectedChannel?.name ?? resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('connecting'),
      emptyBody: getReadOnlyEmptyBody('channel', 'connecting'),
    });
  }

  if (resolved.activeBuffer?.kind === 'query') {
    return createWorkspace(resolved, {
      mode: 'query-connecting',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: getReadOnlySubtitle('connecting'),
      emptyBody: getReadOnlyEmptyBody('query', 'connecting'),
    });
  }

  return createWorkspace(resolved, {
    mode: 'server-connecting',
    selection: selectionFor(resolved.serverBuffer),
    selectedBuffer: resolved.serverBuffer,
    emptyBody: 'Waiting for the server connection to finish.',
  });
};

const buildConnectedWorkspace = (resolved: ResolvedWorkspace): WorkspaceView => {
  if (resolved.activeBuffer?.kind === 'channel' && resolved.selectedChannel) {
    return createWorkspace(resolved, {
      mode: 'channel-connected',
      headerTitle: resolved.selectedChannel.name,
      headerSubtitle: resolved.connectedSubtitle,
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Wait for activity or send a message.',
      showNicklist: true,
    });
  }

  if (resolved.activeBuffer?.kind === 'query') {
    return createWorkspace(resolved, {
      mode: 'query-connected',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: resolved.connectedSubtitle,
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Wait for a reply or send a message.',
    });
  }

  if (resolved.activeBuffer?.kind === 'channel') {
    return createWorkspace(resolved, {
      mode: 'channel-offline',
      headerTitle: resolved.activeBuffer.target,
      headerSubtitle: 'Not joined. History stays available until you rejoin this channel.',
      emptyBody: 'Use /join to re-enter this channel before sending messages.',
    });
  }

  return createWorkspace(resolved, {
    mode: 'server-connected',
    selection: selectionFor(resolved.serverBuffer),
    selectedBuffer: resolved.serverBuffer,
    headerSubtitle: resolved.connectedSubtitle,
    composerMode: 'commands',
    composerPlaceholder: 'Use /join #channel or another /command',
    emptyBody: 'Use /join #channel to enter a channel.',
  });
};
