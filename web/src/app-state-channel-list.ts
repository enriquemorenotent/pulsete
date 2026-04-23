import { channelListEntryLimit } from '../../shared/channel-list.js';
import type { Action, ChannelListState } from './app-types.js';

export const initialChannelListState: ChannelListState = {
  open: false,
  networkId: null,
  requestId: null,
  status: 'idle',
  entries: [],
  totalEntries: null,
  truncated: false,
  error: null,
};

export const reduceChannelListState = (state: ChannelListState, action: Action): ChannelListState => {
  switch (action.type) {
    case 'gateway-connecting':
    case 'gateway-disconnected':
    case 'close-channel-list':
      return initialChannelListState;
    case 'open-channel-list':
      return {
        open: true,
        networkId: action.networkId,
        requestId: null,
        status: 'loading',
        entries: [],
        totalEntries: null,
        truncated: false,
        error: null,
      };
    case 'channel-list-started':
      return canStartChannelList(state, action.networkId)
        ? { ...state, requestId: action.requestId }
        : state;
    case 'channel-list-entry':
      return matchesChannelListRequest(state, action.networkId, action.requestId)
        ? appendChannelListEntries(state, [action.entry])
        : state;
    case 'channel-list-entries':
      return matchesChannelListRequest(state, action.networkId, action.requestId)
        ? appendChannelListEntries(state, action.entries)
        : state;
    case 'channel-list-completed':
      return matchesChannelListRequest(state, action.networkId, action.requestId)
        ? {
            ...state,
            status: 'ready',
            totalEntries: action.totalEntries ?? state.totalEntries ?? state.entries.length,
            truncated: action.truncated ?? state.truncated,
            error: null,
          }
        : state;
    case 'channel-list-failed':
      return canFailChannelList(state, action.networkId, action.requestId)
        ? {
            ...state,
            requestId: action.requestId,
            status: 'error',
            error: action.message,
          }
        : state;
    case 'network-state':
      return action.phase === 'connected' || state.networkId !== action.networkId
        ? state
        : initialChannelListState;
    case 'remove-network':
      return state.networkId === action.networkId ? initialChannelListState : state;
    default:
      return state;
  }
};

export const isChannelListLoadingForNetwork = (state: ChannelListState, networkId: string) =>
  state.open
  && state.networkId === networkId
  && state.status === 'loading';

const canStartChannelList = (state: ChannelListState, networkId: string) =>
  isChannelListLoadingForNetwork(state, networkId)
  && state.requestId === null;

const matchesChannelListRequest = (state: ChannelListState, networkId: string, requestId: string) =>
  state.open
  && state.networkId === networkId
  && state.requestId === requestId;

const canFailChannelList = (state: ChannelListState, networkId: string, requestId: string) =>
  state.open
  && state.networkId === networkId
  && (
    (state.requestId !== null && state.requestId === requestId)
    || (state.requestId === null && state.status === 'loading')
  );

const appendChannelListEntries = (
  state: ChannelListState,
  entries: readonly ChannelListState['entries'][number][],
): ChannelListState => {
  if (entries.length === 0) {
    return state;
  }
  const remaining = Math.max(0, channelListEntryLimit - state.entries.length);
  const accepted = remaining > 0 ? entries.slice(0, remaining) : [];
  const totalEntries = (state.totalEntries ?? state.entries.length) + entries.length;
  return {
    ...state,
    entries: accepted.length > 0 ? [...state.entries, ...accepted] : state.entries,
    totalEntries,
    truncated: state.truncated || accepted.length < entries.length,
  };
};
