import type { AppDomainState, Action } from './app-types.js';
import type { BufferState, FriendState, MutedNickState, NickEmojiState, PendingChannelState } from '../../shared/protocol-chat.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import {
  appendConversationMessages,
  prependConversationMessages,
  removeBufferMessages,
  removeConversationMessages,
  retainedConversationMessageLimit,
  updateBufferMessageMetadata,
} from './conversation-message-state.js';

const retainedConversationMessageOptions = {
  maxMessagesPerConversation: retainedConversationMessageLimit,
};

export const sortBuffers = (buffers: BufferState[]) =>
  [...buffers].sort((left, right) =>
    left.networkId === right.networkId
      ? left.target.localeCompare(right.target)
      : left.networkId.localeCompare(right.networkId)
  );

export const sortFriends = (friends: FriendState[]) =>
  [...friends].sort((left, right) => left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' }));

export const sortMutedNicks = (mutedNicks: MutedNickState[]) =>
  [...mutedNicks].sort((left, right) =>
    left.networkId === right.networkId
      ? left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' })
      : left.networkId.localeCompare(right.networkId)
  );

export const sortNickEmojis = (nickEmojis: NickEmojiState[]) =>
  [...nickEmojis].sort((left, right) =>
    left.networkId === right.networkId
      ? left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' })
      : left.networkId.localeCompare(right.networkId)
  );

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
    case 'upsert-muted-nick': {
      const mutedNicks = domain.mutedNicks.filter((mutedNick) => mutedNick.id !== action.mutedNick.id);
      mutedNicks.push(action.mutedNick);
      return { ...domain, mutedNicks: sortMutedNicks(mutedNicks) };
    }
    case 'remove-muted-nick':
      return {
        ...domain,
        mutedNicks: domain.mutedNicks.filter((mutedNick) => mutedNick.id !== action.mutedNickId),
      };
    case 'upsert-nick-emoji': {
      const nickEmojis = domain.nickEmojis.filter((nickEmoji) => nickEmoji.id !== action.nickEmoji.id);
      nickEmojis.push(action.nickEmoji);
      return { ...domain, nickEmojis: sortNickEmojis(nickEmojis) };
    }
    case 'remove-nick-emoji':
      return {
        ...domain,
        nickEmojis: domain.nickEmojis.filter((nickEmoji) => nickEmoji.id !== action.nickEmojiId),
      };
    case 'friend-presence':
      return {
        ...domain,
        friendPresence: {
          ...domain.friendPresence,
          [action.friendId]: action.presence,
        },
      };
    case 'query-presence':
      return {
        ...domain,
        queryPresence: {
          ...domain.queryPresence,
          [action.bufferId]: action.presence,
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
        messages: updateBufferMessageMetadata(domain.messages, action.buffer),
      };
    }
    case 'remove-buffer': {
      const replacementBuffer = action.replacementBufferId
        ? findBufferById(domain.buffers, action.replacementBufferId)
        : null;
      return {
        ...domain,
        buffers: domain.buffers.filter((buffer) => buffer.id !== action.bufferId),
        queryPresence: Object.fromEntries(
          Object.entries(domain.queryPresence).filter(([bufferId]) => bufferId !== action.bufferId)
        ),
        channels: domain.channels.filter((channel) => channel.id !== action.bufferId),
        messages: removeBufferMessages(domain.messages, action.bufferId, replacementBuffer),
      };
    }
    case 'append-message':
    case 'upsert-message':
      return {
        ...domain,
        messages: appendConversationMessages(
          domain.messages,
          [action.message],
          retainedConversationMessageOptions,
        ),
      };
    case 'append-messages':
      return {
        ...domain,
        messages: appendConversationMessages(
          domain.messages,
          action.messages,
          retainedConversationMessageOptions,
        ),
      };
    case 'prepend-messages':
      return {
        ...domain,
        messages: prependConversationMessages(
          domain.messages,
          action.messages,
          retainedConversationMessageOptions,
        ),
      };
    case 'remove-messages':
      return {
        ...domain,
        messages: removeConversationMessages(
          domain.messages,
          action.networkId,
          action.target,
          action.messageIds,
          action.bufferId,
        ),
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
