import type { BufferState, NetworkProfile } from '../../shared/protocol.js';
import { getWorkspaceNetworks } from './workspace-helpers.js';
import { buildConversationIndex, type ConversationIndex } from './conversation-selectors.js';
import type { SelectedBuffer } from './workspace-types.js';

type ConversationState = Parameters<typeof buildConversationIndex>[0];

export type ConversationModel = ConversationIndex & {
  fallbackSelection: (networks: NetworkProfile[], preferredNetworkId?: string | null) => SelectedBuffer | null;
  normalizeSelection: (
    networks: NetworkProfile[],
    selection: SelectedBuffer | null,
    preferredNetworkId?: string | null
  ) => SelectedBuffer | null;
  selectDefaultBuffer: (networks: NetworkProfile[]) => SelectedBuffer | null;
};

export const selectionFor = (buffer: BufferState | null): SelectedBuffer | null =>
  buffer ? { kind: 'buffer', bufferId: buffer.id } : null;

export const buildConversationModel = (state: ConversationState): ConversationModel => {
  const index = buildConversationIndex(state);

  const getSelectionNetworkId = (selection: SelectedBuffer | null) => {
    if (!selection) {
      return null;
    }
    if (selection.kind === 'pending-channel') {
      return selection.networkId;
    }
    return index.findBufferById(selection.bufferId)?.networkId ?? null;
  };

  const hasSelection = (networks: NetworkProfile[], selection: SelectedBuffer | null) => {
    if (!selection) {
      return false;
    }
    const activeNetworkIds = new Set(getWorkspaceNetworks(networks).map((network) => network.id));
    if (selection.kind === 'pending-channel') {
      return activeNetworkIds.has(selection.networkId)
        && Boolean(index.findPendingChannel(selection.networkId, selection.channel));
    }
    const buffer = index.findBufferById(selection.bufferId);
    return Boolean(buffer && activeNetworkIds.has(buffer.networkId));
  };

  const selectDefaultBuffer = (networks: NetworkProfile[]) => {
    const network = getWorkspaceNetworks(networks)[0];
    return selectionFor(network ? index.findServerBuffer(network.id) : null);
  };

  const fallbackSelection = (networks: NetworkProfile[], preferredNetworkId?: string | null) =>
    selectionFor(preferredNetworkId ? index.findServerBuffer(preferredNetworkId) : null) ?? selectDefaultBuffer(networks);

  const normalizeSelection = (
    networks: NetworkProfile[],
    selection: SelectedBuffer | null,
    preferredNetworkId?: string | null
  ) =>
    hasSelection(networks, selection)
      ? selection
      : fallbackSelection(networks, preferredNetworkId ?? getSelectionNetworkId(selection));

  return {
    ...index,
    fallbackSelection,
    normalizeSelection,
    selectDefaultBuffer,
  };
};
