import type { Action, AppTransientState, Banner, ChannelListState, NetworkManagerState } from './app-types.js';
import { gatewayReconnectMessage } from './gateway.js';

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

export const reduceTransientAction = (
  transient: AppTransientState,
  action: Action
): AppTransientState | null => {
  switch (action.type) {
    case 'snapshot':
      return {
        ...transient,
        banner: null,
        channelList: initialChannelListState,
        historyLoading: false,
      };
    case 'select':
      return {
        ...transient,
        selection: action.selection,
        banner: null,
      };
    case 'set-banner':
      return { ...transient, banner: action.banner };
    case 'gateway-connecting':
      return {
        ...transient,
        channelList: initialChannelListState,
      };
    case 'gateway-connected':
      return {
        ...transient,
        banner: clearReconnectBanner(transient.banner),
      };
    case 'gateway-disconnected':
      return {
        ...transient,
        channelList: initialChannelListState,
        historyLoading: false,
      };
    case 'open-channel-list':
      return {
        ...transient,
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
      return { ...transient, channelList: initialChannelListState };
    case 'channel-list-started':
      if (
        !transient.channelList.open
        || transient.channelList.networkId !== action.networkId
        || transient.channelList.status !== 'loading'
        || transient.channelList.requestId !== null
      ) {
        return transient;
      }
      return {
        ...transient,
        channelList: {
          ...transient.channelList,
          requestId: action.requestId,
        },
      };
    case 'channel-list-entry':
      if (
        !transient.channelList.open
        || transient.channelList.networkId !== action.networkId
        || transient.channelList.requestId !== action.requestId
      ) {
        return transient;
      }
      return {
        ...transient,
        channelList: {
          ...transient.channelList,
          entries: [...transient.channelList.entries, action.entry],
        },
      };
    case 'channel-list-completed':
      if (
        !transient.channelList.open
        || transient.channelList.networkId !== action.networkId
        || transient.channelList.requestId !== action.requestId
      ) {
        return transient;
      }
      return {
        ...transient,
        channelList: {
          ...transient.channelList,
          status: 'ready',
          error: null,
        },
      };
    case 'channel-list-failed':
      if (
        !transient.channelList.open
        || transient.channelList.networkId !== action.networkId
        || (transient.channelList.requestId !== null && transient.channelList.requestId !== action.requestId)
        || (transient.channelList.requestId === null && transient.channelList.status !== 'loading')
      ) {
        return transient;
      }
      return {
        ...transient,
        channelList: {
          ...transient.channelList,
          requestId: action.requestId,
          status: 'error',
          error: action.message,
        },
      };
    case 'network-state':
      if (action.phase === 'connected' || transient.channelList.networkId !== action.networkId) {
        return transient;
      }
      return {
        ...transient,
        channelList: initialChannelListState,
      };
    case 'open-network-manager':
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          mode: 'manager',
          editor: null,
        },
      };
    case 'close-network-manager':
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          mode: 'closed',
          editor: null,
        },
      };
    case 'set-network-manager-favorites':
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          showFavoritesOnly: action.value,
        },
      };
    case 'set-managed-network':
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          managedNetworkId: action.networkId,
        },
      };
    case 'open-network-editor':
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          mode: 'editor',
          managedNetworkId: action.managedNetworkId,
          editor: action.editor,
        },
      };
    case 'close-network-editor':
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          mode: 'manager',
          editor: null,
        },
      };
    case 'set-network-editor-tab':
      if (!transient.networkManager.editor) {
        return transient;
      }
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          editor: {
            ...transient.networkManager.editor,
            tab: action.tab,
          },
        },
      };
    case 'update-network-editor-form':
      if (!transient.networkManager.editor) {
        return transient;
      }
      return {
        ...transient,
        networkManager: {
          ...transient.networkManager,
          editor: {
            ...transient.networkManager.editor,
            form: {
              ...transient.networkManager.editor.form,
              ...action.form,
            },
          },
        },
      };
    case 'set-history-loading':
      return {
        ...transient,
        historyLoading: action.value,
      };
    case 'remove-network':
      if (transient.channelList.networkId !== action.networkId) {
        return transient;
      }
      return {
        ...transient,
        channelList: initialChannelListState,
        historyLoading: false,
      };
    default:
      return null;
  }
};

const clearReconnectBanner = (banner: Banner) =>
  banner?.message === gatewayReconnectMessage ? null : banner;
