import { useReducer } from 'react';
import type { AppSnapshot } from '../../shared/protocol.js';
import { emptyAssistantSnapshot, reduceAssistantDomain } from './assistant-state.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import { indexConversationMessages } from './conversation-message-state.js';
import {
  reduceConversationDomain,
  sortBuffers,
  sortFriends,
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
  friendPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: {},
  networkStates: {},
  assistant: emptyAssistantSnapshot,
  assistantThreads: {},
};

const initialTransientState: AppTransientState = {
  selection: null,
  banner: null,
  channelList: initialChannelListState,
  historyLoading: false,
  assistant: {
    attemptedThreadId: null,
    loadingThreadId: null,
    selectedThreadId: null,
  },
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
  friendPresence: snapshot.friendPresence,
  buffers: sortBuffers(snapshot.buffers),
  channels: snapshot.channels,
  pendingChannels: sortPendingChannels(snapshot.pendingChannels),
  messages: indexConversationMessages(snapshot.messages),
  networkStates: snapshot.networkStates,
  assistant: snapshot.assistant,
  assistantThreads: {},
});

export const reducer = (state: State, action: Action): State => {
  const domain = action.type === 'snapshot'
    ? reduceSnapshotDomain(state, action.snapshot)
    : reduceRuntimeDomain(state.domain, action)
      ?? reduceAssistantDomain(state.domain, action)
      ?? reduceConversationDomain(state.domain, action)
      ?? state.domain;
  const selection = resolveNextSelection(state, domain, action);
  const transientBase = action.type === 'snapshot'
    ? {
        ...state.transient,
        selection,
        banner: null,
        channelList: initialChannelListState,
        historyLoading: false,
        assistant: {
          ...state.transient.assistant,
          attemptedThreadId: null,
          loadingThreadId: null,
          selectedThreadId: action.snapshot.assistant.activeThreadId,
        },
      }
    : selection === state.transient.selection
      ? state.transient
      : { ...state.transient, selection };
  const transient = action.type === 'snapshot'
    ? transientBase
    : reduceTransientAction(transientBase, action) ?? transientBase;

  if (domain === state.domain && transient === state.transient) {
    return state;
  }
  return { domain, transient };
};

export function useStateReducer(initialReducer: typeof reducer, state: State) {
  return useReducer(initialReducer, state);
}
