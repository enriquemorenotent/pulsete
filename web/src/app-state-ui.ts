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
      return { ...state, transient: { ...state.transient, banner: action.banner } };
    case 'open-channel-list':
      return {
        ...state,
        transient: {
          ...state.transient,
          channelList: {
            open: true,
            networkId: action.networkId,
            requestId: null,
            status: 'loading',
            entries: [],
            error: null,
          },
        },
      };
    case 'close-channel-list':
      return { ...state, transient: { ...state.transient, channelList: initialChannelListState } };
    case 'channel-list-started':
      if (
        !state.transient.channelList.open ||
        state.transient.channelList.networkId !== action.networkId ||
        state.transient.channelList.status !== 'loading' ||
        state.transient.channelList.requestId !== null
      ) {
        return state;
      }
      return {
        ...state,
        transient: {
          ...state.transient,
          channelList: {
            ...state.transient.channelList,
            requestId: action.requestId,
          },
        },
      };
    case 'channel-list-entry':
      if (
        !state.transient.channelList.open ||
        state.transient.channelList.networkId !== action.networkId ||
        state.transient.channelList.requestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        transient: {
          ...state.transient,
          channelList: {
            ...state.transient.channelList,
            entries: [...state.transient.channelList.entries, action.entry],
          },
        },
      };
    case 'channel-list-completed':
      if (
        !state.transient.channelList.open ||
        state.transient.channelList.networkId !== action.networkId ||
        state.transient.channelList.requestId !== action.requestId
      ) {
        return state;
      }
      return {
        ...state,
        transient: {
          ...state.transient,
          channelList: {
            ...state.transient.channelList,
            status: 'ready',
            error: null,
          },
        },
      };
    case 'channel-list-failed':
      if (
        !state.transient.channelList.open ||
        state.transient.channelList.networkId !== action.networkId ||
        (state.transient.channelList.requestId !== null && state.transient.channelList.requestId !== action.requestId) ||
        (state.transient.channelList.requestId === null && state.transient.channelList.status !== 'loading')
      ) {
        return state;
      }
      return {
        ...state,
        transient: {
          ...state.transient,
          channelList: {
            ...state.transient.channelList,
            requestId: action.requestId,
            status: 'error',
            error: action.message,
          },
        },
      };
    case 'set-network-form':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkForm: { ...state.transient.networkForm, ...action.form },
        },
      };
    case 'reset-network-form':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkForm: { ...emptyNetworkForm(), ...action.form },
        },
      };
    case 'set-history-loading':
      return {
        ...state,
        transient: {
          ...state.transient,
          historyLoading: action.value,
        },
      };
    default:
      return null;
  }
};
