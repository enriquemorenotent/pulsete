import { useReducer } from 'react';
import type { AppSnapshot, BufferState } from '../../shared/protocol.js';
import { emptyNetworkRuntimeCapabilities } from '../../shared/protocol.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import { indexConversationMessages } from './conversation-message-state.js';
import {
  reduceConversationDomain,
  sortBuffers,
  sortFriends,
  sortMutedNicks,
  sortNickEmojis,
  sortPendingChannels,
} from './app-state-conversations.js';
import { initialChannelListState } from './app-state-channel-list.js';
import { resolveNextSelection } from './app-state-selection.js';
import { reduceRuntimeDomain } from './app-state-runtime.js';
import { initialNetworkManagerState, reduceTransientAction } from './app-state-ui.js';
import type { Action, State } from './app-types.js';

export { initialChannelListState } from './app-state-channel-list.js';

const initialDomainState: AppDomainState = {
  phase: 'loading',
  gatewayStatus: 'connecting',
  networks: [],
  friends: [],
  mutedNicks: [],
  nickEmojis: [],
  friendPresence: {},
  queryPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: {},
  networkStates: {},
};

const initialTransientState: AppTransientState = {
  selection: null,
  banner: null,
  channelList: initialChannelListState,
  historyLoadedByBufferId: {},
  historyHasOlderByBufferId: {},
  networkManager: initialNetworkManagerState,
};

export const initialState: State = {
  domain: initialDomainState,
  transient: initialTransientState,
};

const reduceSnapshotDomain = (state: State, snapshot: AppSnapshot) => ({
  phase: 'ready' as const,
  gatewayStatus: state.domain.gatewayStatus,
  networks: snapshot.networks,
  friends: sortFriends(snapshot.friends),
  mutedNicks: sortMutedNicks(snapshot.mutedNicks),
  nickEmojis: sortNickEmojis(snapshot.nickEmojis),
  friendPresence: snapshot.friendPresence,
  queryPresence: snapshot.queryPresence,
  buffers: sortBuffers(snapshot.buffers),
  channels: snapshot.channels,
  pendingChannels: sortPendingChannels(snapshot.pendingChannels),
  messages: indexConversationMessages(snapshot.messages),
  networkStates: Object.fromEntries(
    Object.entries(snapshot.networkStates).map(([networkId, runtime]) => [
      networkId,
      {
        ...runtime,
        capabilities: runtime.capabilities ?? emptyNetworkRuntimeCapabilities(),
      },
    ]),
  ),
});

export const reducer = (state: State, action: Action): State => {
  const domain = action.type === 'snapshot'
    ? reduceSnapshotDomain(state, action.snapshot)
    : reduceRuntimeDomain(state.domain, action)
      ?? reduceConversationDomain(state.domain, action)
      ?? state.domain;
  const selection = resolveNextSelection(state, domain, action);
  const transientBase = action.type === 'snapshot'
    ? {
        ...state.transient,
	        selection,
	        banner: null,
	        channelList: initialChannelListState,
	        historyLoadedByBufferId: {},
	        historyHasOlderByBufferId: {},
	      }
    : selection === state.transient.selection
      ? state.transient
      : { ...state.transient, selection };
  const reducedTransient = action.type === 'snapshot'
    ? transientBase
    : reduceTransientAction(transientBase, action) ?? transientBase;
  const transient =
    domain.buffers === state.domain.buffers
      ? reducedTransient
      : pruneTransientBufferHistory(reducedTransient, domain.buffers);

  if (domain === state.domain && transient === state.transient) {
    return state;
  }
  return { domain, transient };
};

const pruneTransientBufferHistory = (
  transient: AppTransientState,
  buffers: readonly BufferState[],
): AppTransientState => {
  const activeBufferIds = new Set(buffers.map((buffer) => buffer.id));
  const historyLoadedByBufferId = retainActiveBufferKeys(
    transient.historyLoadedByBufferId,
    activeBufferIds,
  );
  const historyHasOlderByBufferId = retainActiveBufferKeys(
    transient.historyHasOlderByBufferId,
    activeBufferIds,
  );
  if (
    historyLoadedByBufferId === transient.historyLoadedByBufferId
    && historyHasOlderByBufferId === transient.historyHasOlderByBufferId
  ) {
    return transient;
  }
  return {
    ...transient,
    historyLoadedByBufferId,
    historyHasOlderByBufferId,
  };
};

const retainActiveBufferKeys = <T extends Record<string, unknown>>(
  map: T,
  activeBufferIds: ReadonlySet<string>,
): T => {
  let changed = false;
  const entries = Object.entries(map).filter(([bufferId]) => {
    const keep = activeBufferIds.has(bufferId);
    changed ||= !keep;
    return keep;
  });
  return changed ? Object.fromEntries(entries) as T : map;
};

export function useStateReducer(initialReducer: typeof reducer, state: State) {
  return useReducer(initialReducer, state);
}
