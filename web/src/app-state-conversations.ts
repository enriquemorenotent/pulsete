import type { BufferState, FriendState, PendingChannelState } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { Action, ChannelListState, State } from './app-types.js';
import { appendConversationMessages, removeBufferMessages } from './conversation-message-state.js';
import { createSelectionResolver } from './selection-state.js';

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

export const reduceConversationAction = (
  state: State,
  action: Action,
  initialChannelListState: ChannelListState
): State | null => {
  void initialChannelListState;
  const selection = createSelectionResolver(state.domain);
  const conversation = selection.conversation;
  switch (action.type) {
    case 'upsert-friend': {
      const friends = state.domain.friends.filter((friend) => friend.id !== action.friend.id);
      friends.push(action.friend);
      return { ...state, domain: { ...state.domain, friends: sortFriends(friends) } };
    }
    case 'remove-friend':
      return {
        ...state,
        domain: {
          ...state.domain,
          friends: state.domain.friends.filter((friend) => friend.id !== action.friendId),
          friendPresence: Object.fromEntries(
            Object.entries(state.domain.friendPresence).filter(([friendId]) => friendId !== action.friendId)
          ),
        },
      };
    case 'friend-presence':
      return {
        ...state,
        domain: {
          ...state.domain,
          friendPresence: {
            ...state.domain.friendPresence,
            [action.friendId]: action.online,
          },
        },
      };
    case 'upsert-buffer': {
      const buffers = state.domain.buffers.filter((buffer) => buffer.id !== action.buffer.id);
      buffers.push(action.buffer);
      const pendingChannels =
        action.buffer.kind === 'channel'
          ? state.domain.pendingChannels.filter(
              (pendingChannel) =>
                pendingChannel.networkId !== action.buffer.networkId ||
                !isSameIrcIdentifier(pendingChannel.channel, action.buffer.target)
            )
          : state.domain.pendingChannels;
      const selection =
        state.transient.selection?.kind === 'pending-channel' &&
        state.transient.selection.networkId === action.buffer.networkId &&
        isSameIrcIdentifier(state.transient.selection.channel, action.buffer.target) &&
        action.buffer.kind === 'channel'
          ? { kind: 'buffer' as const, bufferId: action.buffer.id }
          : state.transient.selection;
      const nextState: State = {
        ...state,
        domain: {
          ...state.domain,
          buffers: sortBuffers(buffers),
          pendingChannels,
        },
      };
      return {
        ...nextState,
        transient: {
          ...nextState.transient,
          selection: createSelectionResolver(nextState.domain).normalizeSelection(selection),
        },
      };
    }
    case 'remove-buffer': {
      const removedBuffer = conversation.findBufferById(action.bufferId);
      const buffers = state.domain.buffers.filter((buffer) => buffer.id !== action.bufferId);
      const channels = state.domain.channels.filter((channel) => channel.id !== action.bufferId);
      const messages = removedBuffer ? removeBufferMessages(state.domain.messages, removedBuffer) : state.domain.messages;
      const nextState: State = {
        ...state,
        domain: {
          ...state.domain,
          buffers,
          channels,
          messages,
        },
      };
      return {
        ...nextState,
        transient: {
          ...nextState.transient,
          selection:
            state.transient.selection?.kind === 'buffer' && state.transient.selection.bufferId === action.bufferId
              ? createSelectionResolver(nextState.domain).fallbackSelection(action.networkId)
              : state.transient.selection,
        },
      };
    }
    case 'append-message':
      return {
        ...state,
        domain: {
          ...state.domain,
          messages: appendConversationMessages(state.domain.messages, [action.message]),
        },
      };
    case 'append-messages':
      return {
        ...state,
        domain: {
          ...state.domain,
          messages: appendConversationMessages(state.domain.messages, action.messages),
        },
      };
    case 'upsert-channel': {
      const channels = state.domain.channels.filter((channel) => channel.id !== action.channel.id);
      channels.push(action.channel);
      return {
        ...state,
        domain: {
          ...state.domain,
          channels: channels.sort((left, right) => left.name.localeCompare(right.name)),
        },
      };
    }
    case 'remove-channel':
      return {
        ...state,
        domain: {
          ...state.domain,
          channels: state.domain.channels.filter((channel) => channel.id !== action.channelId),
        },
      };
    case 'add-pending-channel': {
      const existingBuffer = conversation.findChannelBuffer(
        action.pendingChannel.networkId,
        action.pendingChannel.channel
      );
      if (existingBuffer) {
        return state;
      }
      const pendingChannels = state.domain.pendingChannels.filter(
        (pendingChannel) =>
          pendingChannel.networkId !== action.pendingChannel.networkId ||
          !isSameIrcIdentifier(pendingChannel.channel, action.pendingChannel.channel)
      );
      pendingChannels.push(action.pendingChannel);
      return {
        ...state,
        domain: {
          ...state.domain,
          pendingChannels: sortPendingChannels(pendingChannels),
        },
      };
    }
    case 'remove-pending-channel': {
      const pendingChannels = state.domain.pendingChannels.filter(
        (pendingChannel) =>
          pendingChannel.networkId !== action.networkId || !isSameIrcIdentifier(pendingChannel.channel, action.channel)
      );
      const matchingChannelBuffer = conversation.findChannelBuffer(action.networkId, action.channel);
      const nextState: State = {
        ...state,
        domain: {
          ...state.domain,
          pendingChannels,
        },
      };
      return {
        ...nextState,
        transient: {
          ...nextState.transient,
          selection:
            state.transient.selection?.kind === 'pending-channel' &&
            state.transient.selection.networkId === action.networkId &&
            isSameIrcIdentifier(state.transient.selection.channel, action.channel)
              ? matchingChannelBuffer
                ? { kind: 'buffer', bufferId: matchingChannelBuffer.id }
                : createSelectionResolver(nextState.domain).fallbackSelection(action.networkId)
              : state.transient.selection,
        },
      };
    }
    case 'update-presence':
      return {
        ...state,
        domain: {
          ...state.domain,
          channels: state.domain.channels.map((channel) =>
            channel.networkId === action.networkId && isSameIrcIdentifier(channel.name, action.channel)
              ? { ...channel, users: action.users }
              : channel
          ),
        },
      };
    default:
      return null;
  }
};
