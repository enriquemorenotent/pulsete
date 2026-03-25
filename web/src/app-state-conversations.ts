import type { AppDomainState, Action } from './app-types.js';
import type { BufferState, FriendState, PendingChannelState } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import {
  appendConversationMessages,
  prependConversationMessages,
  removeBufferMessages,
  removeConversationMessages,
} from './conversation-message-state.js';

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

const findBufferById = (buffers: BufferState[], bufferId: string) =>
  buffers.find((buffer) => buffer.id === bufferId) ?? null;

const hasChannelBuffer = (buffers: BufferState[], networkId: string, channel: string) =>
  buffers.some((buffer) =>
    buffer.networkId === networkId
    && buffer.kind === 'channel'
    && isSameIrcIdentifier(buffer.target, channel)
  );

export const reduceConversationDomain = (
  domain: AppDomainState,
  action: Action,
): AppDomainState | null => {
  switch (action.type) {
    case 'upsert-friend': {
      const friends = domain.friends.filter((friend) => friend.id !== action.friend.id);
      friends.push(action.friend);
      return { ...domain, friends: sortFriends(friends) };
    }
    case 'remove-friend':
      return {
        ...domain,
        friends: domain.friends.filter((friend) => friend.id !== action.friendId),
        friendPresence: Object.fromEntries(
          Object.entries(domain.friendPresence).filter(([friendId]) => friendId !== action.friendId)
        ),
      };
    case 'friend-presence':
      return {
        ...domain,
        friendPresence: {
          ...domain.friendPresence,
          [action.friendId]: action.online,
        },
      };
    case 'upsert-buffer': {
      const buffers = domain.buffers.filter((buffer) => buffer.id !== action.buffer.id);
      buffers.push(action.buffer);
      const pendingChannels =
        action.buffer.kind === 'channel'
          ? domain.pendingChannels.filter(
              (pendingChannel) =>
                pendingChannel.networkId !== action.buffer.networkId
                || !isSameIrcIdentifier(pendingChannel.channel, action.buffer.target)
            )
          : domain.pendingChannels;
      return {
        ...domain,
        buffers: sortBuffers(buffers),
        pendingChannels,
      };
    }
    case 'remove-buffer': {
      const removedBuffer = findBufferById(domain.buffers, action.bufferId);
      return {
        ...domain,
        buffers: domain.buffers.filter((buffer) => buffer.id !== action.bufferId),
        channels: domain.channels.filter((channel) => channel.id !== action.bufferId),
        messages: removedBuffer ? removeBufferMessages(domain.messages, removedBuffer) : domain.messages,
      };
    }
    case 'append-message':
    case 'upsert-message':
      return {
        ...domain,
        messages: appendConversationMessages(domain.messages, [action.message]),
      };
    case 'append-messages':
      return {
        ...domain,
        messages: appendConversationMessages(domain.messages, action.messages),
      };
    case 'prepend-messages':
      return {
        ...domain,
        messages: prependConversationMessages(domain.messages, action.messages),
      };
    case 'remove-messages':
      return {
        ...domain,
        messages: removeConversationMessages(domain.messages, action.networkId, action.target, action.messageIds),
      };
    case 'upsert-channel': {
      const channels = domain.channels.filter((channel) => channel.id !== action.channel.id);
      channels.push(action.channel);
      return {
        ...domain,
        channels: channels.sort((left, right) => left.name.localeCompare(right.name)),
      };
    }
    case 'remove-channel':
      return {
        ...domain,
        channels: domain.channels.filter((channel) => channel.id !== action.channelId),
      };
    case 'add-pending-channel': {
      if (hasChannelBuffer(domain.buffers, action.pendingChannel.networkId, action.pendingChannel.channel)) {
        return domain;
      }
      const pendingChannels = domain.pendingChannels.filter(
        (pendingChannel) =>
          pendingChannel.networkId !== action.pendingChannel.networkId
          || !isSameIrcIdentifier(pendingChannel.channel, action.pendingChannel.channel)
      );
      pendingChannels.push(action.pendingChannel);
      return {
        ...domain,
        pendingChannels: sortPendingChannels(pendingChannels),
      };
    }
    case 'remove-pending-channel':
      return {
        ...domain,
        pendingChannels: domain.pendingChannels.filter(
          (pendingChannel) =>
            pendingChannel.networkId !== action.networkId
            || !isSameIrcIdentifier(pendingChannel.channel, action.channel)
        ),
      };
    case 'update-presence':
      return {
        ...domain,
        channels: domain.channels.map((channel) =>
          channel.networkId === action.networkId && isSameIrcIdentifier(channel.name, action.channel)
            ? { ...channel, users: action.users }
            : channel
        ),
      };
    default:
      return null;
  }
};
