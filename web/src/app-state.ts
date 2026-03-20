import { useState } from 'react';
import type { AppSnapshot, BufferState, ChatMessage, FriendState } from '../../shared/protocol.js';
import { matchesBufferMessage } from './message-matching.js';
import { emptyNetworkForm } from './network-form.js';
import { selectDefaultBuffer } from './workspace.js';
import type { Action, ChannelListState, State } from './app-types.js';

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
  networks: [],
  friends: [],
  friendPresence: {},
  buffers: [],
  channels: [],
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

const fallbackSelection = (state: Pick<State, 'networks' | 'buffers'>, preferredNetworkId?: string | null) => {
  if (preferredNetworkId) {
    const buffer = state.buffers.find((candidate) => candidate.networkId === preferredNetworkId && candidate.kind === 'server') ?? null;
    if (buffer) {
      return { bufferId: buffer.id };
    }
  }
  return selectDefaultBuffer(state as Pick<AppSnapshot, 'networks' | 'buffers'>);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'snapshot-loaded':
      return {
        ...state,
        phase: 'ready',
        networks: action.snapshot.networks,
        friends: sortFriends(action.snapshot.friends),
        friendPresence: action.snapshot.friendPresence,
        buffers: sortBuffers(action.snapshot.buffers),
        channels: action.snapshot.channels,
        messages: action.snapshot.messages,
        networkStates: action.snapshot.networkStates,
        selection: selectDefaultBuffer(action.snapshot),
        banner: null,
        channelList: initialChannelListState,
      };
    case 'snapshot':
      return {
        ...state,
        phase: 'ready',
        networks: action.snapshot.networks,
        friends: sortFriends(action.snapshot.friends),
        friendPresence: action.snapshot.friendPresence,
        buffers: sortBuffers(action.snapshot.buffers),
        channels: action.snapshot.channels,
        messages: mergeMessages(state.messages, action.snapshot.messages),
        networkStates: action.snapshot.networkStates,
        selection: state.selection ?? selectDefaultBuffer(action.snapshot),
      };
    case 'load-failed':
      return { ...state, phase: 'ready' };
    case 'upsert-network': {
      const networks = state.networks.filter((network) => network.id !== action.network.id);
      networks.push(action.network);
      return { ...state, networks: networks.sort((left, right) => left.name.localeCompare(right.name)) };
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
      return { ...state, buffers: sortBuffers(buffers) };
    }
    case 'remove-buffer': {
      const buffers = state.buffers.filter((buffer) => buffer.id !== action.bufferId);
      const channels = state.channels.filter((channel) => channel.id !== action.bufferId);
      const messages = state.messages.filter((message) => {
        const removedBuffer = state.buffers.find((buffer) => buffer.id === action.bufferId);
        if (!removedBuffer) {
          return true;
        }
        return !matchesBufferMessage(removedBuffer, message);
      });
      const selection = state.selection?.bufferId === action.bufferId
        ? fallbackSelection({ networks: state.networks, buffers }, action.networkId)
        : state.selection;
      return { ...state, buffers, channels, messages, selection };
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
    case 'update-presence':
      return {
        ...state,
        channels: state.channels.map((channel) =>
          channel.networkId === action.networkId && channel.name === action.channel
            ? { ...channel, users: action.users }
            : channel
        ),
      };
    case 'network-connecting':
      return {
        ...state,
        networkStates: {
          ...state.networkStates,
          [action.networkId]: { connected: false, connecting: true, serverName: null, nick: action.nick },
        },
      };
    case 'network-state':
      return {
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
        channelList:
          !action.connected && state.channelList.networkId === action.networkId
            ? initialChannelListState
            : state.channelList,
      };
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
        !state.channelList.open
        || state.channelList.networkId !== action.networkId
        || state.channelList.status !== 'loading'
        || state.channelList.requestId !== null
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
        !state.channelList.open
        || state.channelList.networkId !== action.networkId
        || state.channelList.requestId !== action.requestId
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
        !state.channelList.open
        || state.channelList.networkId !== action.networkId
        || state.channelList.requestId !== action.requestId
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
        !state.channelList.open
        || state.channelList.networkId !== action.networkId
        || (state.channelList.requestId !== null && state.channelList.requestId !== action.requestId)
        || (state.channelList.requestId === null && state.channelList.status !== 'loading')
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
      const messages = state.messages.filter((message) => message.networkId !== action.networkId);
      const networkStates = { ...state.networkStates };
      delete networkStates[action.networkId];
      const selection = state.selection && state.buffers.some((buffer) => buffer.id === state.selection?.bufferId && buffer.networkId === action.networkId)
        ? fallbackSelection({ networks, buffers })
        : state.selection;
      return {
        ...state,
        networks,
        buffers,
        channels,
        messages,
        networkStates,
        selection,
        channelList: state.channelList.networkId === action.networkId ? initialChannelListState : state.channelList,
      };
    }
    default:
      return state;
  }
};

export function useStateReducer<T, A>(reducerFn: (state: T, action: A) => T, initial: T) {
  const [state, setState] = useState(initial);
  const dispatch = (action: A) => setState((current) => reducerFn(current, action));
  return [state, dispatch] as const;
}
