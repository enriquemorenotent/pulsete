import type { BufferState, NetworkProfile, PendingChannelState } from '../../shared/protocol-chat.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { ConversationIndex } from './conversation-selectors.js';
import {
  getConnectionLabel,
  getConnectionLabelParts,
  getConnectionStatus,
  type ConnectionLabelParts,
} from './workspace.js';
import type { NetworkRuntimeState, SelectedBuffer } from './workspace.js';

export type SidebarConnectionView = {
  network: NetworkProfile;
  runtime: NetworkRuntimeState | null;
  serverBuffer: BufferState | null;
  childBuffers: Array<{ buffer: BufferState; selected: boolean }>;
  pendingChannels: Array<{ pendingChannel: PendingChannelState; selected: boolean }>;
  childBuffersDimmed: boolean;
  selectedServer: boolean;
  label: string;
  labelParts: ConnectionLabelParts;
};

type ConnectionSidebarViewInput = {
  networks: NetworkProfile[];
  conversation: Pick<ConversationIndex, 'listBuffersForNetwork' | 'listPendingChannelsForNetwork'>;
  networkStates: Record<string, NetworkRuntimeState>;
  selection: SelectedBuffer | null;
};

export const buildConnectionSidebarView = (
  input: ConnectionSidebarViewInput
): SidebarConnectionView[] =>
  input.networks.map((network) => {
    const runtime = input.networkStates[network.id] ?? null;
    const networkBuffers = input.conversation.listBuffersForNetwork(network.id);
    const pendingChannels = input.conversation
      .listPendingChannelsForNetwork(network.id)
      .map((pendingChannel) => ({
        pendingChannel,
        selected:
          input.selection?.kind === 'pending-channel'
          && input.selection.networkId === pendingChannel.networkId
          && isSameIrcIdentifier(input.selection.channel, pendingChannel.channel),
      }));
    const serverBuffer = networkBuffers.find((buffer) => buffer.kind === 'server') ?? null;

    return {
      network,
      runtime,
      serverBuffer,
      childBuffers: networkBuffers
        .filter((buffer) => buffer.kind !== 'server')
        .sort(compareBuffers)
        .map((buffer) => ({
          buffer,
          selected: input.selection?.kind === 'buffer' && input.selection.bufferId === buffer.id,
        })),
      pendingChannels,
      childBuffersDimmed: getConnectionStatus(runtime) !== 'connected',
      selectedServer: input.selection?.kind === 'buffer' && input.selection.bufferId === serverBuffer?.id,
      label: getConnectionLabel(input.networks, network, runtime),
      labelParts: getConnectionLabelParts(input.networks, network, runtime),
    };
  });

const compareBuffers = (left: BufferState, right: BufferState) => {
  const order = { server: 0, channel: 1, query: 2 } satisfies Record<BufferState['kind'], number>;
  return order[left.kind] - order[right.kind] || left.target.localeCompare(right.target);
};
