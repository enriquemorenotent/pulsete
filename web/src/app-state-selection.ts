import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { State } from './app-types.js';
import { selectDefaultBuffer } from './workspace.js';

type SelectionState = Pick<State, 'networks' | 'buffers' | 'pendingChannels'>;

export const fallbackSelection = (state: Pick<State, 'networks' | 'buffers'>, preferredNetworkId?: string | null) => {
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

const getSelectionNetworkId = (state: SelectionState, selection: State['selection']) => {
  if (!selection) {
    return null;
  }
  if (selection.kind === 'pending-channel') {
    return selection.networkId;
  }
  return state.buffers.find((buffer) => buffer.id === selection.bufferId)?.networkId ?? null;
};

const hasSelection = (state: SelectionState, selection: State['selection']) => {
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
  selection: State['selection'],
  preferredNetworkId?: string | null
) => {
  if (hasSelection(state, selection)) {
    return selection;
  }
  return fallbackSelection(state, preferredNetworkId ?? getSelectionNetworkId(state, selection));
};
