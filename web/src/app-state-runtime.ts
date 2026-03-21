import type { Action, ChannelListState, State } from './app-types.js';
import { normalizeSelection } from './app-state-selection.js';
import { gatewayReconnectMessage } from './gateway.js';

const offlineNetworkStates = (state: Pick<State, 'networks'>) =>
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
        gatewayStatus: 'connecting',
        channelList: initialChannelListState,
      };
    case 'gateway-connected':
      return {
        ...state,
        gatewayStatus: 'connected',
        banner: state.banner?.message === gatewayReconnectMessage ? null : state.banner,
      };
    case 'gateway-disconnected': {
      const nextState = {
        ...state,
        gatewayStatus: 'disconnected' as const,
        pendingChannels: [],
        networkStates: offlineNetworkStates(state),
        channelList: initialChannelListState,
        historyLoading: false,
      };
      return {
        ...nextState,
        selection: normalizeSelection(nextState, state.selection),
      };
    }
    case 'upsert-network': {
      const networks = state.networks.filter((network) => network.id !== action.network.id);
      networks.push(action.network);
      const runtime = state.networkStates[action.network.id] ?? null;
      return {
        ...state,
        networks: networks.sort((left, right) => left.name.localeCompare(right.name)),
        networkStates:
          runtime?.phase === 'connected'
            ? state.networkStates
            : {
                ...state.networkStates,
                [action.network.id]: {
                  phase: runtime?.phase ?? 'offline',
                  serverName: runtime?.serverName ?? null,
                  nick: action.network.nick,
                },
              },
      };
    }
    case 'network-state': {
      const pendingChannels =
        action.phase === 'connected'
          ? state.pendingChannels
          : state.pendingChannels.filter((pendingChannel) => pendingChannel.networkId !== action.networkId);
      const nextState = {
        ...state,
        networkStates: {
          ...state.networkStates,
          [action.networkId]: {
            phase: action.phase,
            serverName: action.serverName,
            nick: action.nick,
          },
        },
        pendingChannels,
        channelList:
          action.phase !== 'connected' && state.channelList.networkId === action.networkId
            ? initialChannelListState
            : state.channelList,
      };
      return {
        ...nextState,
        selection:
          action.phase === 'connected'
            ? state.selection
            : normalizeSelection(nextState, state.selection, action.networkId),
      };
    }
    default:
      return null;
  }
};
