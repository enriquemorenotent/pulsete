import { useReducer } from 'react';
import type { AppSnapshot } from '../../shared/protocol.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import { indexConversationMessages } from './conversation-message-state.js';
import {
  reduceConversationAction,
  sortBuffers,
  sortFriends,
  sortPendingChannels,
} from './app-state-conversations.js';
import { reduceRuntimeAction } from './app-state-runtime.js';
import { initialChannelListState, initialNetworkManagerState, reduceUiAction } from './app-state-ui.js';
import { createSelectionResolver } from './selection-state.js';
import type { Action, State } from './app-types.js';

export { initialChannelListState } from './app-state-ui.js';

const initialDomainState: AppDomainState = {
  phase: 'loading',
  gatewayStatus: 'connecting',
  networks: [],
  friends: [],
  friendPresence: {},
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
  historyLoading: false,
  networkManager: initialNetworkManagerState,
};

export const initialState: State = {
  domain: initialDomainState,
  transient: initialTransientState,
};

const reduceSnapshotState = (state: State, snapshot: AppSnapshot): State => {
  const networks = snapshot.networks;
  const buffers = sortBuffers(snapshot.buffers);
  const pendingChannels = sortPendingChannels(snapshot.pendingChannels);
  const nextDomain: AppDomainState = {
    phase: 'ready',
    gatewayStatus: state.domain.gatewayStatus,
    networks,
    friends: sortFriends(snapshot.friends),
    friendPresence: snapshot.friendPresence,
    buffers,
    channels: snapshot.channels,
    pendingChannels,
    messages: indexConversationMessages(snapshot.messages),
    networkStates: snapshot.networkStates,
  };
  const selection = createSelectionResolver({
    buffers,
    channels: snapshot.channels,
    pendingChannels,
    messages: nextDomain.messages,
    networks,
  }).normalizeSelection(state.transient.selection);
  return {
    domain: nextDomain,
    transient: {
      ...state.transient,
      selection,
      banner: null,
      channelList: initialChannelListState,
      historyLoading: false,
    },
  };
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'snapshot':
      return reduceSnapshotState(state, action.snapshot);
    case 'select':
      return {
        ...state,
        transient: {
          ...state.transient,
          selection: action.selection,
          banner: null,
        },
      };
    default:
      return (
        reduceRuntimeAction(state, action, initialChannelListState) ??
        reduceConversationAction(state, action, initialChannelListState) ??
        reduceUiAction(state, action) ??
        state
      );
  }
};

export function useStateReducer(initialReducer: typeof reducer, state: State) {
  return useReducer(initialReducer, state);
}
