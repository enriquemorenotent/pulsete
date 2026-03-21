import type { Action, ChannelListState, NetworkManagerState, State } from './app-types.js';

export const initialChannelListState: ChannelListState = {
  open: false,
  networkId: null,
  requestId: null,
  status: 'idle',
  entries: [],
  error: null,
};

export const initialNetworkManagerState: NetworkManagerState = {
  mode: 'closed',
  managedNetworkId: null,
  showFavoritesOnly: false,
  editor: null,
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
    case 'open-network-manager':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            mode: 'manager',
            editor: null,
          },
        },
      };
    case 'close-network-manager':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            mode: 'closed',
            editor: null,
          },
        },
      };
    case 'set-network-manager-favorites':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            showFavoritesOnly: action.value,
          },
        },
      };
    case 'set-managed-network':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            managedNetworkId: action.networkId,
          },
        },
      };
    case 'open-network-editor':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            mode: 'editor',
            managedNetworkId: action.managedNetworkId,
            editor: action.editor,
          },
        },
      };
    case 'close-network-editor':
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            mode: 'manager',
            editor: null,
          },
        },
      };
    case 'set-network-editor-tab':
      if (!state.transient.networkManager.editor) {
        return state;
      }
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            editor: {
              ...state.transient.networkManager.editor,
              tab: action.tab,
            },
          },
        },
      };
    case 'update-network-editor-form':
      if (!state.transient.networkManager.editor) {
        return state;
      }
      return {
        ...state,
        transient: {
          ...state.transient,
          networkManager: {
            ...state.transient.networkManager,
            editor: {
              ...state.transient.networkManager.editor,
              form: {
                ...state.transient.networkManager.editor.form,
                ...action.form,
              },
            },
          },
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
