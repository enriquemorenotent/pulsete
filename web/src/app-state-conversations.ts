import type { BufferState, ChatMessage, FriendState, PendingChannelState } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { Action, ChannelListState, State } from './app-types.js';
import { fallbackSelection, normalizeSelection } from './app-state-selection.js';
import { matchesBufferMessage } from './message-matching.js';

export const sortBuffers = (buffers: BufferState[]) =>
  [...buffers].sort((left, right) =>
    left.networkId === right.networkId
      ? left.target.localeCompare(right.target)
      : left.networkId.localeCompare(right.networkId)
  );

export const sortFriends = (friends: FriendState[]) =>
  [...friends].sort((left, right) => left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' }));

export const sortPendingChannels = (pendingChannels: PendingChannelState[]) =>
  [...pendingChannels].sort((left, right) =>
    left.networkId === right.networkId
      ? left.channel.localeCompare(right.channel)
      : left.networkId.localeCompare(right.networkId)
  );

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

export const reduceConversationAction = (
  state: State,
  action: Action,
  initialChannelListState: ChannelListState
): State | null => {
  switch (action.type) {
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
          channel.networkId === action.networkId && isSameIrcIdentifier(channel.name, action.channel)
            ? { ...channel, users: action.users }
            : channel
        ),
      };
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
        historyLoading: false,
      };
      return {
        ...nextState,
        selection: normalizeSelection(nextState, state.selection),
      };
    }
    default:
      return null;
  }
};
