import type { Action, AppTransientState, Banner, NetworkManagerState } from './app-types.js';
import { reduceChannelListState } from './app-state-channel-list.js';
import { gatewayReconnectMessage } from './gateway.js';

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
  const channelList = reduceChannelListState(transient.channelList, action);
  const withChannelList = (patch: Omit<Partial<AppTransientState>, 'channelList'> = {}) =>
    channelList === transient.channelList
      ? { ...transient, ...patch }
      : { ...transient, channelList, ...patch };

  switch (action.type) {
    case 'select':
      return withChannelList({ banner: null, historyLoading: false, historyLoadingOlder: false });
    case 'set-banner':
      return withChannelList({ banner: action.banner });
    case 'gateway-connected':
      return withChannelList({ banner: clearReconnectBanner(transient.banner) });
    case 'gateway-disconnected':
      return withChannelList({
        historyLoading: false,
        historyLoadingOlder: false,
        historyLoadedByBufferId: {},
        historyHasOlderByBufferId: {},
      });
    case 'set-assistant-loading-thread':
      return {
        ...transient,
        assistant: {
          ...transient.assistant,
          attemptedThreadId: action.threadId ?? transient.assistant.attemptedThreadId,
          loadingThreadId: action.threadId,
        },
      };
    case 'assistant-snapshot':
      return {
        ...transient,
        assistant: {
          ...transient.assistant,
          attemptedThreadId: null,
        },
      };
    case 'select-assistant-thread':
      return {
        ...transient,
        assistant: {
          ...transient.assistant,
          selectedThreadId: action.threadId,
        },
      };
    case 'assistant-thread-removed':
      return {
        ...transient,
        assistant: {
          ...transient.assistant,
          attemptedThreadId: transient.assistant.attemptedThreadId === action.threadId ? null : transient.assistant.attemptedThreadId,
          loadingThreadId: transient.assistant.loadingThreadId === action.threadId ? null : transient.assistant.loadingThreadId,
          selectedThreadId: transient.assistant.selectedThreadId === action.threadId ? null : transient.assistant.selectedThreadId,
        },
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
    case 'set-history-loading-older':
      return {
        ...transient,
        historyLoadingOlder: action.value,
      };
    case 'history-buffer-loaded':
      return {
        ...transient,
        historyLoadedByBufferId: {
          ...transient.historyLoadedByBufferId,
          [action.bufferId]: true,
        },
        historyHasOlderByBufferId: {
          ...transient.historyHasOlderByBufferId,
          [action.bufferId]: action.hasOlder,
        },
      };
    case 'remove-buffer':
      return {
        ...withChannelList(),
        historyLoadedByBufferId: omitHistoryBuffer(transient.historyLoadedByBufferId, action.bufferId),
        historyHasOlderByBufferId: omitHistoryBuffer(transient.historyHasOlderByBufferId, action.bufferId),
      };
    case 'remove-network':
      if (channelList === transient.channelList) {
        return {
          ...transient,
          historyLoading: false,
          historyLoadingOlder: false,
          historyLoadedByBufferId: {},
          historyHasOlderByBufferId: {},
        };
      }
      return withChannelList({
        historyLoading: false,
        historyLoadingOlder: false,
        historyLoadedByBufferId: {},
        historyHasOlderByBufferId: {},
      });
    default:
      return channelList === transient.channelList ? null : withChannelList();
  }
};

const clearReconnectBanner = (banner: Banner) =>
  banner?.message === gatewayReconnectMessage ? null : banner;

const omitHistoryBuffer = <T extends Record<string, unknown>>(map: T, bufferId: string) => {
  if (!(bufferId in map)) {
    return map;
  }
  const next = { ...map };
  delete next[bufferId];
  return next;
};
