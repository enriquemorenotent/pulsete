import { useReducer } from 'react';
import type { AppSnapshot } from '../../shared/protocol.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import { indexConversationMessages } from './conversation-message-state.js';
import {
  reduceConversationDomain,
  sortBuffers,
  sortFriends,
  sortPendingChannels,
} from './app-state-conversations.js';
import { reconcileState } from './app-state-reconcile.js';
import { reduceRuntimeDomain } from './app-state-runtime.js';
import { initialChannelListState, initialNetworkManagerState, reduceTransientAction } from './app-state-ui.js';
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
  return {
    domain: {
      phase: 'ready',
      gatewayStatus: state.domain.gatewayStatus,
      networks: snapshot.networks,
      friends: sortFriends(snapshot.friends),
      friendPresence: snapshot.friendPresence,
      buffers: sortBuffers(snapshot.buffers),
      channels: snapshot.channels,
      pendingChannels: sortPendingChannels(snapshot.pendingChannels),
      messages: indexConversationMessages(snapshot.messages),
      networkStates: snapshot.networkStates,
    },
    transient: {
      ...state.transient,
      banner: null,
      channelList: initialChannelListState,
      historyLoading: false,
    },
  };
};

export const reducer = (state: State, action: Action): State => {
  const nextState = action.type === 'snapshot'
    ? reduceSnapshotState(state, action.snapshot)
    : {
        domain:
          reduceRuntimeDomain(state.domain, action)
          ?? reduceConversationDomain(state.domain, action)
          ?? state.domain,
        transient: reduceTransientAction(state.transient, action) ?? state.transient,
      };

  if (nextState.domain === state.domain && nextState.transient === state.transient) {
    return state;
  }
  return reconcileState(state, nextState, action);
};

export function useStateReducer(initialReducer: typeof reducer, state: State) {
  return useReducer(initialReducer, state);
}
