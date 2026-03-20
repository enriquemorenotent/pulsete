import { useReducer } from 'react';
import type { AppSnapshot, BufferState, ChatMessage, FriendState, PendingChannelState } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import { matchesBufferMessage } from './message-matching.js';
import { emptyNetworkForm } from './network-form.js';
import type { Action, ChannelListState, State } from './app-types.js';
import { gatewayReconnectMessage } from './gateway.js';
import { selectDefaultBuffer } from './workspace.js';

export const initialChannelListState: ChannelListState = {
  open: false,
  networkId: null,
  requestId: null,
  status: 'idle',
  entries: [],
  error: null,
};

export const initialState: State = {
  phase: 'loading',
  gatewayStatus: 'connecting',
  networks: [],
  friends: [],
  friendPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: [],
  networkStates: {},
  selection: null,
  networkForm: emptyNetworkForm(),
  banner: null,
  channelList: initialChannelListState,
  historyLoading: false,
};

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const merged = new Map<string, ChatMessage>();
  for (const message of current) {
    merged.set(message.id, message);
  }
  for (const message of incoming) {
    merged.set(message.id, message);
  }
  return Array.from(merged.values()).sort((left, right) => left.ts - right.ts);
};

const sortBuffers = (buffers: BufferState[]) =>
  [...buffers].sort((left, right) =>
    left.networkId === right.networkId
      ? left.target.localeCompare(right.target)
      : left.networkId.localeCompare(right.networkId)
  );

const sortFriends = (friends: FriendState[]) =>
  [...friends].sort((left, right) => left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' }));

const sortPendingChannels = (pendingChannels: PendingChannelState[]) =>
  [...pendingChannels].sort((left, right) =>
    left.networkId === right.networkId
      ? left.channel.localeCompare(right.channel)
      : left.networkId.localeCompare(right.networkId)
  );

type SelectionState = Pick<State, 'networks' | 'buffers' | 'pendingChannels'>;

const fallbackSelection = (state: Pick<State, 'networks' | 'buffers'>, preferredNetworkId?: string | null) => {
  if (preferredNetworkId) {
    const serverBuffer = state.buffers.find(
      (candidate) => candidate.networkId === preferredNetworkId && candidate.kind === 'server'
    );
    if (serverBuffer) {
      return { kind: 'buffer' as const, bufferId: serverBuffer.id };
    }
  }
  return selectDefaultBuffer(state);
};

const getSelectionNetworkId = (state: SelectionState, selection: State['selection']) => {
  if (!selection) {
    return null;
  }
  if (selection.kind === 'pending-channel') {
    return selection.networkId;
  }
  return state.buffers.find((buffer) => buffer.id === selection.bufferId)?.networkId ?? null;
};

const hasSelection = (state: SelectionState, selection: State['selection']) => {
  if (!selection) {
    return false;
  }
  if (selection.kind === 'pending-channel') {
    return state.pendingChannels.some(
      (pendingChannel) =>
        pendingChannel.networkId === selection.networkId &&
        isSameIrcIdentifier(pendingChannel.channel, selection.channel)
    );
  }
  return state.buffers.some((buffer) => buffer.id === selection.bufferId);
};

const normalizeSelection = (state: SelectionState, selection: State['selection'], preferredNetworkId?: string | null) => {
  if (hasSelection(state, selection)) {
    return selection;
  }
  return fallbackSelection(state, preferredNetworkId ?? getSelectionNetworkId(state, selection));
};

const offlineNetworkStates = (state: Pick<State, 'networks'>) =>
  Object.fromEntries(
    state.networks.map((network) => [
      network.id,
      {
        connected: false,
        connecting: false,
        serverName: null,
        nick: network.nick,
      },
    ])
  );

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'snapshot': {
      const selection = normalizeSelection(action.snapshot, state.selection);
      return {
        ...state,
        phase: 'ready',
        networks: action.snapshot.networks,
        friends: sortFriends(action.snapshot.friends),
        friendPresence: action.snapshot.friendPresence,
        buffers: sortBuffers(action.snapshot.buffers),
        channels: action.snapshot.channels,
        pendingChannels: sortPendingChannels(action.snapshot.pendingChannels),
        messages: action.snapshot.messages,
        networkStates: action.snapshot.networkStates,
        selection,
        banner: null,
        channelList: initialChannelListState,
      };
    }
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
      };
      return {
        ...nextState,
        selection: normalizeSelection(nextState, state.selection),
      };
    }
    case 'upsert-network': {
      const networks = state.networks.filter((network) => network.id !== action.network.id);
      networks.push(action.network);
      return {
        ...state,
        networks: networks.sort((left, right) => left.name.localeCompare(right.name)),
      };
    }
    case 'upsert-friend': {
      const friends = state.friends.filter((friend) => friend.id !== action.friend.id);
      friends.push(action.friend);
      return { ...state, friends: sortFriends(friends) };
    }
    case 'remove-friend':
      return {
        ...state,
        friends: state.friends.filter((friend) => friend.id !== action.friendId),
        friendPresence: Object.fromEntries(
          Object.entries(state.friendPresence).filter(([friendId]) => friendId !== action.friendId)
        ),
      };
    case 'friend-presence':
      return {
        ...state,
        friendPresence: {
          ...state.friendPresence,
          [action.friendId]: action.online,
        },
      };
    case 'upsert-buffer': {
      const buffers = state.buffers.filter((buffer) => buffer.id !== action.buffer.id);
      buffers.push(action.buffer);
      const pendingChannels =
        action.buffer.kind === 'channel'
          ? state.pendingChannels.filter(
              (pendingChannel) =>
                pendingChannel.networkId !== action.buffer.networkId ||
                !isSameIrcIdentifier(pendingChannel.channel, action.buffer.target)
            )
          : state.pendingChannels;
      const selection =
        state.selection?.kind === 'pending-channel' &&
        state.selection.networkId === action.buffer.networkId &&
        isSameIrcIdentifier(state.selection.channel, action.buffer.target) &&
        action.buffer.kind === 'channel'
          ? { kind: 'buffer' as const, bufferId: action.buffer.id }
          : state.selection;
      const nextState = { ...state, buffers: sortBuffers(buffers), pendingChannels };
      return { ...nextState, selection: normalizeSelection(nextState, selection) };
    }
    case 'remove-buffer': {
      const removedBuffer = state.buffers.find((buffer) => buffer.id === action.bufferId) ?? null;
      const buffers = state.buffers.filter((buffer) => buffer.id !== action.bufferId);
      const channels = state.channels.filter((channel) => channel.id !== action.bufferId);
      const messages = removedBuffer
        ? state.messages.filter((message) => !matchesBufferMessage(removedBuffer, message))
        : state.messages;
      const nextState = { ...state, buffers, channels, messages };
      return {
        ...nextState,
        selection:
          state.selection?.kind === 'buffer' && state.selection.bufferId === action.bufferId
            ? fallbackSelection(nextState, action.networkId)
            : state.selection,
      };
    }
    case 'select':
      return { ...state, selection: action.selection, banner: null };
    case 'append-message':
      return { ...state, messages: mergeMessages(state.messages, [action.message]) };
    case 'append-messages':
      return { ...state, messages: mergeMessages(state.messages, action.messages) };
    case 'upsert-channel': {
      const channels = state.channels.filter((channel) => channel.id !== action.channel.id);
      channels.push(action.channel);
      return { ...state, channels: channels.sort((left, right) => left.name.localeCompare(right.name)) };
    }
    case 'remove-channel':
      return {
        ...state,
        channels: state.channels.filter((channel) => channel.id !== action.channelId),
      };
    case 'add-pending-channel': {
      const existingBuffer = state.buffers.find(
        (buffer) =>
          buffer.networkId === action.pendingChannel.networkId &&
          buffer.kind === 'channel' &&
          isSameIrcIdentifier(buffer.target, action.pendingChannel.channel)
      );
      if (existingBuffer) {
        return state;
      }
      const pendingChannels = state.pendingChannels.filter(
        (pendingChannel) =>
          pendingChannel.networkId !== action.pendingChannel.networkId ||
          !isSameIrcIdentifier(pendingChannel.channel, action.pendingChannel.channel)
      );
      pendingChannels.push(action.pendingChannel);
      return {
        ...state,
        pendingChannels: sortPendingChannels(pendingChannels),
      };
    }
    case 'remove-pending-channel': {
      const pendingChannels = state.pendingChannels.filter(
        (pendingChannel) =>
          pendingChannel.networkId !== action.networkId || !isSameIrcIdentifier(pendingChannel.channel, action.channel)
      );
      const matchingChannelBuffer =
        state.buffers.find(
          (buffer) =>
            buffer.networkId === action.networkId &&
            buffer.kind === 'channel' &&
            isSameIrcIdentifier(buffer.target, action.channel)
        ) ?? null;
      const nextState = { ...state, pendingChannels };
      return {
        ...nextState,
        selection:
          state.selection?.kind === 'pending-channel' &&
          state.selection.networkId === action.networkId &&
          isSameIrcIdentifier(state.selection.channel, action.channel)
            ? matchingChannelBuffer
              ? { kind: 'buffer', bufferId: matchingChannelBuffer.id }
              : fallbackSelection(nextState, action.networkId)
            : state.selection,
      };
    }
    case 'update-presence':
      return {
        ...state,
        channels: state.channels.map((channel) =>
          channel.networkId === action.networkId && channel.name === action.channel
            ? { ...channel, users: action.users }
            : channel
        ),
      };
    case 'network-state': {
      const pendingChannels =
        action.connected
          ? state.pendingChannels
          : state.pendingChannels.filter((pendingChannel) => pendingChannel.networkId !== action.networkId);
      const nextState = {
        ...state,
        networkStates: {
          ...state.networkStates,
          [action.networkId]: {
            connected: action.connected,
            connecting: false,
            serverName: action.serverName,
            nick: action.nick,
          },
        },
        pendingChannels,
        channelList:
          !action.connected && state.channelList.networkId === action.networkId
            ? initialChannelListState
            : state.channelList,
      };
      return {
        ...nextState,
        selection: action.connected ? state.selection : normalizeSelection(nextState, state.selection, action.networkId),
      };
    }
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
    case 'remove-network': {
      const networks = state.networks.filter((network) => network.id !== action.networkId);
      const buffers = state.buffers.filter((buffer) => buffer.networkId !== action.networkId);
      const channels = state.channels.filter((channel) => channel.networkId !== action.networkId);
      const pendingChannels = state.pendingChannels.filter((pendingChannel) => pendingChannel.networkId !== action.networkId);
      const messages = state.messages.filter((message) => message.networkId !== action.networkId);
      const networkStates = { ...state.networkStates };
      delete networkStates[action.networkId];
      const nextState = {
        ...state,
        networks,
        buffers,
        channels,
        pendingChannels,
        messages,
        networkStates,
        channelList: state.channelList.networkId === action.networkId ? initialChannelListState : state.channelList,
      };
      return {
        ...nextState,
        selection: normalizeSelection(nextState, state.selection),
      };
    }
    default:
      return state;
  }
};

export function useStateReducer(initialReducer: typeof reducer, state: State) {
  return useReducer(initialReducer, state);
}
