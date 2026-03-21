import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { BufferState, NetworkProfile, PendingChannelState } from '../../shared/protocol.js';
import { selectDefaultBuffer } from './workspace.js';
import type { SelectedBuffer } from './workspace-types.js';

type SelectionState = {
  networks: NetworkProfile[];
  buffers: BufferState[];
  pendingChannels: PendingChannelState[];
};

export const fallbackSelection = (
  state: Pick<SelectionState, 'networks' | 'buffers'>,
  preferredNetworkId?: string | null
) => {
  if (preferredNetworkId) {
    const serverBuffer = state.buffers.find(
      (candidate) => candidate.networkId === preferredNetworkId && candidate.kind === 'server'
    );
    if (serverBuffer) {
      return { kind: 'buffer' as const, bufferId: serverBuffer.id };
    }
  }
  return selectDefaultBuffer(state);
};

const getSelectionNetworkId = (state: SelectionState, selection: SelectedBuffer | null) => {
  if (!selection) {
    return null;
  }
  if (selection.kind === 'pending-channel') {
    return selection.networkId;
  }
  return state.buffers.find((buffer) => buffer.id === selection.bufferId)?.networkId ?? null;
};

const hasSelection = (state: SelectionState, selection: SelectedBuffer | null) => {
  if (!selection) {
    return false;
  }
  if (selection.kind === 'pending-channel') {
    return state.pendingChannels.some(
      (pendingChannel) =>
        pendingChannel.networkId === selection.networkId &&
        isSameIrcIdentifier(pendingChannel.channel, selection.channel)
    );
  }
  return state.buffers.some((buffer) => buffer.id === selection.bufferId);
};

export const normalizeSelection = (
  state: SelectionState,
  selection: SelectedBuffer | null,
  preferredNetworkId?: string | null
) => {
  if (hasSelection(state, selection)) {
    return selection;
  }
  return fallbackSelection(state, preferredNetworkId ?? getSelectionNetworkId(state, selection));
};
