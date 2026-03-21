import { useReducer } from 'react';
import type { AppSnapshot } from '../../shared/protocol.js';
import { indexConversationMessages } from './conversation-message-state.js';
import {
  reduceConversationAction,
  sortBuffers,
  sortFriends,
  sortPendingChannels,
} from './app-state-conversations.js';
import { normalizeSelection } from './app-state-selection.js';
import { reduceRuntimeAction } from './app-state-runtime.js';
import { initialChannelListState, reduceUiAction } from './app-state-ui.js';
import { emptyNetworkForm } from './network-form.js';
import type { Action, State } from './app-types.js';

export { initialChannelListState } from './app-state-ui.js';

export const initialState: State = {
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
  selection: null,
  networkForm: emptyNetworkForm(),
  banner: null,
  channelList: initialChannelListState,
  historyLoading: false,
};

const reduceSnapshotState = (state: State, snapshot: AppSnapshot): State => {
  const selection = normalizeSelection(snapshot, state.selection);
  return {
    ...state,
    phase: 'ready',
    networks: snapshot.networks,
    friends: sortFriends(snapshot.friends),
    friendPresence: snapshot.friendPresence,
    buffers: sortBuffers(snapshot.buffers),
    channels: snapshot.channels,
    pendingChannels: sortPendingChannels(snapshot.pendingChannels),
    messages: indexConversationMessages(snapshot.messages),
    networkStates: snapshot.networkStates,
    selection,
    banner: null,
    channelList: initialChannelListState,
    historyLoading: false,
  };
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'snapshot':
      return reduceSnapshotState(state, action.snapshot);
    case 'select':
      return { ...state, selection: action.selection, banner: null };
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
