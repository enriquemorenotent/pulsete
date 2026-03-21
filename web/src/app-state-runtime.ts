import type { Action, ChannelListState, State } from './app-types.js';
import { removeNetworkMessages } from './conversation-message-state.js';
import { gatewayReconnectMessage } from './gateway.js';
import { createSelectionResolver } from './selection-state.js';

const offlineNetworkStates = (state: Pick<State['domain'], 'networks'>) =>
  Object.fromEntries(
    state.networks.map((network) => [
      network.id,
      {
        phase: 'offline' as const,
        serverName: null,
        nick: network.nick,
      },
    ])
  );

export const reduceRuntimeAction = (
  state: State,
  action: Action,
  initialChannelListState: ChannelListState
): State | null => {
  switch (action.type) {
    case 'gateway-connecting':
      return {
        ...state,
        domain: {
          ...state.domain,
          gatewayStatus: 'connecting',
        },
        transient: {
          ...state.transient,
          channelList: initialChannelListState,
        },
      };
    case 'gateway-connected':
      return {
        ...state,
        domain: {
          ...state.domain,
          gatewayStatus: 'connected',
        },
        transient: {
          ...state.transient,
          banner:
            state.transient.banner?.message === gatewayReconnectMessage ? null : state.transient.banner,
        },
      };
    case 'gateway-disconnected': {
      const nextState: State = {
        ...state,
        domain: {
          ...state.domain,
          gatewayStatus: 'disconnected',
          pendingChannels: [],
          networkStates: offlineNetworkStates(state.domain),
        },
        transient: {
          ...state.transient,
          channelList: initialChannelListState,
          historyLoading: false,
        },
      };
      return {
        ...nextState,
        transient: {
          ...nextState.transient,
          selection: createSelectionResolver(nextState.domain).normalizeSelection(state.transient.selection),
        },
      };
    }
    case 'upsert-network': {
      const networks = state.domain.networks.filter((network) => network.id !== action.network.id);
      networks.push(action.network);
      const runtime = state.domain.networkStates[action.network.id] ?? null;
      return {
        ...state,
        domain: {
          ...state.domain,
          networks: networks.sort((left, right) => left.name.localeCompare(right.name)),
          networkStates:
            runtime?.phase === 'connected'
              ? state.domain.networkStates
              : {
                  ...state.domain.networkStates,
                  [action.network.id]: {
                    phase: runtime?.phase ?? 'offline',
                    serverName: runtime?.serverName ?? null,
                    nick: action.network.nick,
                  },
                },
        },
      };
    }
    case 'network-state': {
      const pendingChannels =
        action.phase === 'connected'
          ? state.domain.pendingChannels
          : state.domain.pendingChannels.filter((pendingChannel) => pendingChannel.networkId !== action.networkId);
      const nextState: State = {
        ...state,
        domain: {
          ...state.domain,
          networkStates: {
            ...state.domain.networkStates,
            [action.networkId]: {
              phase: action.phase,
              serverName: action.serverName,
              nick: action.nick,
            },
          },
          pendingChannels,
        },
        transient: {
          ...state.transient,
          channelList:
            action.phase !== 'connected' && state.transient.channelList.networkId === action.networkId
              ? initialChannelListState
              : state.transient.channelList,
        },
      };
      return {
        ...nextState,
        transient: {
          ...nextState.transient,
          selection:
            action.phase === 'connected'
              ? state.transient.selection
              : createSelectionResolver(nextState.domain).normalizeSelection(state.transient.selection, action.networkId),
        },
      };
    }
    case 'remove-network': {
      const networkStates = { ...state.domain.networkStates };
      delete networkStates[action.networkId];
      const nextState: State = {
        ...state,
        domain: {
          ...state.domain,
          networks: state.domain.networks.filter((network) => network.id !== action.networkId),
          buffers: state.domain.buffers.filter((buffer) => buffer.networkId !== action.networkId),
          channels: state.domain.channels.filter((channel) => channel.networkId !== action.networkId),
          pendingChannels: state.domain.pendingChannels.filter((pendingChannel) => pendingChannel.networkId !== action.networkId),
          messages: removeNetworkMessages(state.domain.messages, action.networkId),
          networkStates,
        },
        transient: {
          ...state.transient,
          channelList:
            state.transient.channelList.networkId === action.networkId ? initialChannelListState : state.transient.channelList,
          historyLoading: false,
        },
      };
      return {
        ...nextState,
        transient: {
          ...nextState.transient,
          selection: createSelectionResolver(nextState.domain).normalizeSelection(state.transient.selection),
        },
      };
    }
    default:
      return null;
  }
};
