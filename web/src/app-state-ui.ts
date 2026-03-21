import type { Action, ChannelListState, State } from './app-types.js';
import { emptyNetworkForm } from './network-form.js';

export const initialChannelListState: ChannelListState = {
  open: false,
  networkId: null,
  requestId: null,
  status: 'idle',
  entries: [],
  error: null,
};

export const reduceUiAction = (state: State, action: Action): State | null => {
  switch (action.type) {
    case 'set-banner':
      return { ...state, banner: action.banner };
    case 'open-channel-list':
      return {
        ...state,
        channelList: {
          open: true,
          networkId: action.networkId,
          requestId: null,
          status: 'loading',
          entries: [],
          error: null,
        },
      };
    case 'close-channel-list':
      return { ...state, channelList: initialChannelListState };
    case 'channel-list-started':
      if (
        !state.channelList.open ||
        state.channelList.networkId !== action.networkId ||
        state.channelList.status !== 'loading' ||
        state.channelList.requestId !== null
      ) {
        return state;
      }
      return {
        ...state,
        channelList: {
          ...state.channelList,
          requestId: action.requestId,
        },
      };
    case 'channel-list-entry':
      if (
        !state.channelList.open ||
        state.channelList.networkId !== action.networkId ||
        state.channelList.requestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        channelList: {
          ...state.channelList,
          entries: [...state.channelList.entries, action.entry],
        },
      };
    case 'channel-list-completed':
      if (
        !state.channelList.open ||
        state.channelList.networkId !== action.networkId ||
        state.channelList.requestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        channelList: {
          ...state.channelList,
          status: 'ready',
          error: null,
        },
      };
    case 'channel-list-failed':
      if (
        !state.channelList.open ||
        state.channelList.networkId !== action.networkId ||
        (state.channelList.requestId !== null && state.channelList.requestId !== action.requestId) ||
        (state.channelList.requestId === null && state.channelList.status !== 'loading')
      ) {
        return state;
      }
      return {
        ...state,
        channelList: {
          ...state.channelList,
          requestId: action.requestId,
          status: 'error',
          error: action.message,
        },
      };
    case 'set-network-form':
      return { ...state, networkForm: { ...state.networkForm, ...action.form } };
    case 'reset-network-form':
      return { ...state, networkForm: { ...emptyNetworkForm(), ...action.form } };
    case 'set-history-loading':
      return { ...state, historyLoading: action.value };
    default:
      return null;
  }
};
