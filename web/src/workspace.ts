import type { AppSnapshot, BufferState, ChannelState, NetworkProfile } from '../../shared/protocol.js';
import { getConnectionInstances, getConnectionStatus } from './workspace-helpers.js';
import type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';

export type { NetworkRuntimeState, SelectedBuffer, WorkspaceView } from './workspace-types.js';
export { getConnectionStatus, getConnectionLabel, getConnectionLabelParts } from './workspace-helpers.js';

type WorkspaceInput = {
  networks: NetworkProfile[];
  buffers: BufferState[];
  channels: ChannelState[];
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
};

const selectionFor = (buffer: BufferState | null): SelectedBuffer | null =>
  buffer ? { bufferId: buffer.id } : null;

const findServerBuffer = (buffers: BufferState[], networkId: string) =>
  buffers.find((buffer) => buffer.networkId === networkId && buffer.kind === 'server') ?? null;

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
  return selectionFor(instance ? findServerBuffer(snapshot.buffers, instance.id) : null);
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
      selectedBuffer: null,
      selectedChannel: null,
      headerTitle: 'No active connection',
      headerSubtitle: '',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Open Network Manager to create or connect an instance.',
      showNicklist: false,
    };
  }

  const selectedBuffer =
    input.buffers.find((buffer) => buffer.id === input.selection?.bufferId) ?? null;
  const selectedNetwork =
    connectionInstances.find((network) => network.id === selectedBuffer?.networkId) ?? connectionInstances[0];
  const selectedRuntime = input.networkStates[selectedNetwork.id] ?? null;
  const connectionStatus = getConnectionStatus(selectedRuntime);
  const serverBuffer = findServerBuffer(input.buffers, selectedNetwork.id);
  const activeBuffer =
    !selectedBuffer || selectedBuffer.networkId !== selectedNetwork.id ? serverBuffer : selectedBuffer;
  const activeSelection = selectionFor(activeBuffer);

  if (!serverBuffer) {
    return {
      mode: 'empty',
      selection: null,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: null,
      selectedChannel: null,
      headerTitle: 'No active connection',
      headerSubtitle: '',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Open Network Manager to create or connect an instance.',
      showNicklist: false,
    };
  }

  const selectedChannel = activeBuffer?.kind === 'channel'
    ? input.channels.find((channel) => channel.id === activeBuffer.id) ?? null
    : null;

  if (connectionStatus === 'offline' && activeBuffer?.kind === 'channel') {
    return {
      mode: 'channel-offline',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel,
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
      headerTitle: '',
      headerSubtitle: '',
      composerMode: 'hidden',
      composerPlaceholder: '',
      emptyBody: 'Waiting for the server connection to finish.',
      showNicklist: false,
    };
  }

  const connectedSubtitle = `${selectedRuntime?.nick ?? selectedNetwork.nick} @ ${selectedRuntime?.serverName ?? 'server'}`;

  if (activeBuffer?.kind === 'channel' && selectedChannel) {
    return {
      mode: 'channel-connected',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel,
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
      mode: 'channel-pending',
      selection: activeSelection,
      connectionInstances,
      selectedNetwork,
      selectedRuntime,
      selectedBuffer: activeBuffer,
      selectedChannel: null,
      headerTitle: activeBuffer.target,
      headerSubtitle: connectedSubtitle,
      composerMode: 'normal',
      composerPlaceholder: 'Type a message or /command',
      emptyBody: 'Waiting for the server to open this channel buffer.',
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
    headerTitle: '',
    headerSubtitle: connectedSubtitle,
    composerMode: 'commands',
    composerPlaceholder: 'Use /join #channel or another /command',
    emptyBody: 'Use /join #channel to enter a channel.',
    showNicklist: false,
  };
};
