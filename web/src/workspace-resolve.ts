import type { BufferState, ChannelState, NetworkProfile, PendingChannelState } from '../../shared/protocol.js';
import { selectionFor } from './conversation-model.js';
import type { ConversationIndex } from './conversation-selectors.js';
import { getConnectionStatus, getWorkspaceNetworks } from './workspace-helpers.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace-types.js';

export type WorkspaceInput = {
  networks: NetworkProfile[];
  conversation: ConversationIndex;
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
};

export type ResolvedWorkspace = {
  workspaceNetworks: NetworkProfile[];
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

export const getReadOnlySubtitle = (status: 'offline' | 'connecting') =>
  status === 'offline'
    ? 'Offline. History only until you reconnect.'
    : 'Reconnecting. History stays available until the connection returns.';

export const getReadOnlyEmptyBody = (
  kind: Extract<BufferState['kind'], 'channel' | 'query'>,
  status: 'offline' | 'connecting'
) => {
  const prefix = kind === 'channel'
    ? 'No saved channel history yet.'
    : 'No saved private-message history yet.';
  const suffix = status === 'offline'
    ? 'Reconnect to resume the conversation.'
    : 'Wait for the connection to finish to resume the conversation.';
  return `${prefix} ${suffix}`;
};

export const resolveWorkspace = (input: WorkspaceInput): ResolvedWorkspace | null => {
  const workspaceNetworks = getWorkspaceNetworks(input.networks);
  if (workspaceNetworks.length === 0) {
    return null;
  }

  const selectedBuffer = input.conversation.findSelectedBuffer(input.selection);
  const selectedPendingChannel = input.conversation.findSelectedPendingChannel(input.selection);
  const selectedNetwork =
    workspaceNetworks.find(
      (network) => network.id === selectedBuffer?.networkId || network.id === selectedPendingChannel?.networkId
    ) ?? workspaceNetworks[0];
  const selectedRuntime = input.networkStates[selectedNetwork.id] ?? null;
  const serverBuffer = input.conversation.findServerBuffer(selectedNetwork.id);
  const activeBuffer =
    !selectedBuffer || selectedBuffer.networkId !== selectedNetwork.id ? serverBuffer : selectedBuffer;
  const activePendingChannel =
    selectedPendingChannel && selectedPendingChannel.networkId === selectedNetwork.id ? selectedPendingChannel : null;

  return {
    workspaceNetworks,
    selectedNetwork,
    selectedRuntime,
    selectedBuffer,
    selectedPendingChannel,
    activeBuffer,
    activeSelection: selectionFor(activeBuffer),
    activePendingChannel,
    selectedChannel: activeBuffer ? input.conversation.findChannelByBuffer(activeBuffer) : null,
    serverBuffer,
    connectedSubtitle: `${selectedRuntime?.nick ?? selectedNetwork.nick} @ ${selectedRuntime?.serverName ?? 'server'}`,
    connectionStatus: getConnectionStatus(selectedRuntime),
    inputSelection: input.selection,
  };
};
